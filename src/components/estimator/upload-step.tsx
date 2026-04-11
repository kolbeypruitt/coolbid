"use client";

import { useRef, useState } from "react";
import { Upload, FileUp, Loader2, Check } from "lucide-react";

import { useEstimator } from "@/hooks/use-estimator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClimateZoneKey } from "@/types/hvac";
import { SYSTEM_TYPE_LABELS } from "@/types/catalog";
import type { SystemType } from "@/types/catalog";

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

const CLIMATE_ZONES: { value: ClimateZoneKey; label: string }[] = [
  { value: "hot_humid", label: "Hot & Humid" },
  { value: "hot_dry", label: "Hot & Dry" },
  { value: "warm", label: "Warm" },
  { value: "mixed", label: "Mixed" },
  { value: "cool", label: "Cool" },
  { value: "cold", label: "Cold" },
];

type PagePreview = {
  pageNum: number;
  previewUrl: string;
  base64: string;
  mediaType: string;
};

type ProcessingState = {
  fileName: string;
  totalPages: number;
  currentPage: number;
  status: "reading" | "rendering" | "done";
} | null;

export function UploadStep() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState<ProcessingState>(null);
  const {
    projectName,
    customerName,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    identicalUnits,
    climateZone,
    systemType,
    setProjectInfo,
    setBuildingInfo,
    setPdfPages,
    setSelectedPages,
    setFile,
    setStep,
    setError,
  } = useEstimator();

  async function handleFile(file: File) {
    setError(null);

    if (file.type === "application/pdf") {
      try {
        setProcessing({ fileName: file.name, totalPages: 0, currentPage: 0, status: "reading" });

        const pdfjs = await loadPdfjs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const pages: PagePreview[] = [];

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
          const previewUrl = canvas.toDataURL("image/jpeg", 0.3);

          pages.push({ pageNum: i, previewUrl, base64, mediaType: "image/jpeg" });
        }

        setProcessing((prev) => prev ? { ...prev, status: "done" } : prev);

        setPdfPages(pages);
        setFile(file.name, pages[0]?.previewUrl ?? "");

        if (pages.length === 1) {
          setSelectedPages([1]);
        }

        setTimeout(() => {
          setProcessing(null);
          setStep("select_pages");
        }, 300);
      } catch (err) {
        setProcessing(null);
        setError(err instanceof Error ? err.message : "Failed to process PDF");
      }
    } else {
      setProcessing({ fileName: file.name, totalPages: 1, currentPage: 1, status: "reading" });

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        const mediaType = file.type as string;

        const page: PagePreview = {
          pageNum: 1,
          previewUrl: dataUrl,
          base64,
          mediaType,
        };
        setPdfPages([page]);
        setSelectedPages([1]);
        setFile(file.name, dataUrl);

        setProcessing((prev) => prev ? { ...prev, status: "done" } : prev);
        setTimeout(() => {
          setProcessing(null);
          setStep("select_pages");
        }, 300);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-4">
      {/* Project Info */}
      <Card className="bg-gradient-card border-border">
        <CardHeader>
          <CardTitle className="text-txt-primary">Project Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-txt-secondary">Project Name</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectInfo({ projectName: e.target.value })}
              placeholder="New HVAC Estimate"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-name" className="text-txt-secondary">Customer Name</Label>
            <Input
              id="customer-name"
              value={customerName}
              onChange={(e) => setProjectInfo({ customerName: e.target.value })}
              placeholder="Customer name"
            />
          </div>
        </CardContent>
      </Card>

      {/* Building Info */}
      <Card className="bg-gradient-card border-border">
        <CardHeader>
          <CardTitle className="text-txt-primary">Building Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="total-sqft" className="text-txt-secondary">Total Sq Ft</Label>
            <Input
              id="total-sqft"
              type="number"
              value={knownTotalSqft}
              onChange={(e) => setBuildingInfo({ knownTotalSqft: e.target.value })}
              placeholder="e.g. 2400"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="num-units" className="text-txt-secondary">Number of Units</Label>
            <Input
              id="num-units"
              type="number"
              min={1}
              value={knownUnits}
              onChange={(e) =>
                setBuildingInfo({ knownUnits: parseInt(e.target.value, 10) || 1 })
              }
            />
          </div>
          {knownUnits > 1 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="hvac-config" className="text-txt-secondary">HVAC Config</Label>
                <Select
                  value={hvacPerUnit ? "per_unit" : "shared"}
                  onValueChange={(val) =>
                    setBuildingInfo({ hvacPerUnit: val === "per_unit" })
                  }
                >
                  <SelectTrigger id="hvac-config" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_unit">Per Unit</SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hvacPerUnit && (
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={identicalUnits}
                    onChange={(e) => setBuildingInfo({ identicalUnits: e.target.checked })}
                    className="h-4 w-4 rounded accent-primary"
                  />
                  <span className="text-sm text-txt-secondary">All units are identical layout</span>
                </label>
              )}
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="climate-zone" className="text-txt-secondary">Climate Zone</Label>
            <Select
              value={climateZone}
              onValueChange={(val) =>
                setBuildingInfo({ climateZone: val as ClimateZoneKey })
              }
            >
              <SelectTrigger id="climate-zone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIMATE_ZONES.map((z) => (
                  <SelectItem key={z.value} value={z.value}>
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="system-type" className="text-txt-secondary">System Type</Label>
            <Select
              value={systemType}
              onValueChange={(val) => setBuildingInfo({ systemType: val as SystemType })}
            >
              <SelectTrigger id="system-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SYSTEM_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card className="bg-gradient-card border-border">
        <CardHeader>
          <CardTitle className="text-txt-primary">Upload Floorplan</CardTitle>
        </CardHeader>
        <CardContent>
          {processing ? (
            <div className="flex flex-col items-center gap-4 rounded-lg border bg-bg-card p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-glow">
                {processing.status === "done" ? (
                  <Check className="h-7 w-7 text-primary" />
                ) : (
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                )}
              </div>

              <div className="text-center">
                <p className="text-sm font-medium text-txt-primary">
                  {processing.status === "reading" && "Reading file..."}
                  {processing.status === "rendering" &&
                    `Rendering page ${processing.currentPage} of ${processing.totalPages}...`}
                  {processing.status === "done" && "Done!"}
                </p>
                <p className="mt-1 flex items-center justify-center gap-2 text-xs text-txt-tertiary">
                  <FileUp className="h-3.5 w-3.5" />
                  {processing.fileName}
                </p>
              </div>

              {processing.totalPages > 0 && (
                <div className="w-full max-w-xs">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-bg-card">
                    <div
                      className="h-full rounded-full progress-fill transition-all duration-300 ease-out"
                      style={{
                        width: `${processing.status === "done" ? 100 : Math.round((processing.currentPage / processing.totalPages) * 100)}%`,
                      }}
                    />
                  </div>
                  {processing.totalPages > 1 && processing.status === "rendering" && (
                    <p className="mt-1.5 text-center text-xs text-txt-tertiary">
                      {processing.currentPage} / {processing.totalPages} pages
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-b-accent rounded-lg p-10 text-center bg-accent-glow hover:bg-accent-glow-strong hover:shadow-[0_0_40px_rgba(6,182,212,0.08)] transition-all duration-300 cursor-pointer flex flex-col items-center justify-center"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <Upload className="mb-3 size-8 text-accent-light" />
              <p className="text-sm font-medium text-txt-primary">Click to upload or drag & drop</p>
              <p className="mt-1 text-xs text-txt-tertiary">
                PDF, PNG, JPG, JPEG, or WebP
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={handleInputChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
