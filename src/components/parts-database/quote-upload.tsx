"use client";

import { useRef, useState } from "react";
import { Upload, FileUp, Loader2, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Supplier, ParsedQuoteResult } from "@/types/catalog";

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

type PageData = {
  pageNum: number;
  base64: string;
  mediaType: string;
};

type ProcessingState = {
  fileName: string;
  totalPages: number;
  currentPage: number;
  status: "reading" | "rendering" | "sending" | "done";
} | null;

interface QuoteUploadProps {
  suppliers: Supplier[];
  onParsed: (result: ParsedQuoteResult, supplierId: string, fileName: string) => void;
}

export function QuoteUpload({ suppliers, onParsed }: QuoteUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [processing, setProcessing] = useState<ProcessingState>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!supplierId) {
      setError("Please select a supplier before uploading.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }

    setError(null);

    try {
      setProcessing({ fileName: file.name, totalPages: 0, currentPage: 0, status: "reading" });

      const pdfjs = await loadPdfjs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const pages: PageData[] = [];

      setProcessing({ fileName: file.name, totalPages: pdf.numPages, currentPage: 0, status: "rendering" });

      for (let i = 1; i <= pdf.numPages; i++) {
        setProcessing((prev) => prev ? { ...prev, currentPage: i } : prev);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];

        pages.push({ pageNum: i, base64, mediaType: "image/jpeg" });
      }

      setProcessing((prev) => prev ? { ...prev, status: "sending" } : prev);

      const response = await fetch("/api/parse-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: pages }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to parse quote");
      }

      const result = (await response.json()) as ParsedQuoteResult;

      setProcessing((prev) => prev ? { ...prev, status: "done" } : prev);

      setTimeout(() => {
        setProcessing(null);
        onParsed(result, supplierId, file.name);
      }, 300);
    } catch (err) {
      setProcessing(null);
      setError(err instanceof Error ? err.message : "Failed to process PDF");
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  if (suppliers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No suppliers found. Please complete onboarding to add a supplier before uploading quotes.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Select Supplier</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-select">Supplier</Label>
            <Select value={supplierId} onValueChange={(val) => setSupplierId(val ?? "")}>
              <SelectTrigger id="supplier-select" className="w-full">
                <SelectValue placeholder="Select a supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Quote</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {processing ? (
            <div className="flex flex-col items-center gap-4 rounded-lg border bg-muted/30 p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                {processing.status === "done" ? (
                  <Check className="h-7 w-7 text-primary" />
                ) : (
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {processing.status === "reading" && "Reading file..."}
                  {processing.status === "rendering" &&
                    `Rendering page ${processing.currentPage} of ${processing.totalPages}...`}
                  {processing.status === "sending" && "Analyzing quote with AI..."}
                  {processing.status === "done" && "Done!"}
                </p>
                <p className="mt-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <FileUp className="h-3.5 w-3.5" />
                  {processing.fileName}
                </p>
              </div>
              {processing.totalPages > 0 && processing.status === "rendering" && (
                <div className="w-full max-w-xs">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.round((processing.currentPage / processing.totalPages) * 100)}%`,
                      }}
                    />
                  </div>
                  {processing.totalPages > 1 && (
                    <p className="mt-1.5 text-center text-xs text-muted-foreground">
                      {processing.currentPage} / {processing.totalPages} pages
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary hover:bg-primary/5"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <Upload className="mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Click to upload or drag & drop</p>
              <p className="mt-1 text-xs text-muted-foreground">PDF only</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleInputChange}
          />
        </CardContent>
      </Card>

      {!processing && supplierId && (
        <div className="flex justify-end">
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Upload PDF
          </Button>
        </div>
      )}
    </div>
  );
}
