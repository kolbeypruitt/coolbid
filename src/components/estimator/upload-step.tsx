"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import * as pdfjs from "pdfjs-dist";

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

pdfjs.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

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

export function UploadStep() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    projectName,
    customerName,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    climateZone,
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
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const pages: PagePreview[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });

          // Full quality canvas for base64
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];

          // Lower quality canvas for preview
          const previewCanvas = document.createElement("canvas");
          previewCanvas.width = viewport.width;
          previewCanvas.height = viewport.height;
          const previewCtx = previewCanvas.getContext("2d")!;
          await page.render({ canvas: previewCanvas, canvasContext: previewCtx, viewport }).promise;
          const previewUrl = previewCanvas.toDataURL("image/jpeg", 0.3);

          pages.push({ pageNum: i, previewUrl, base64, mediaType: "image/jpeg" });
        }

        setPdfPages(pages);
        setFile(file.name, pages[0]?.previewUrl ?? "");

        if (pages.length === 1) {
          setSelectedPages([1]);
        }
        setStep("select_pages");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to process PDF");
      }
    } else {
      // Image file
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
        setStep("select_pages");
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
      <Card>
        <CardHeader>
          <CardTitle>Project Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectInfo({ projectName: e.target.value })}
              placeholder="New HVAC Estimate"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-name">Customer Name</Label>
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
      <Card>
        <CardHeader>
          <CardTitle>Building Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="total-sqft">Total Sq Ft</Label>
            <Input
              id="total-sqft"
              type="number"
              value={knownTotalSqft}
              onChange={(e) => setBuildingInfo({ knownTotalSqft: e.target.value })}
              placeholder="e.g. 2400"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="num-units">Number of Units</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="hvac-config">HVAC Config</Label>
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
          )}
          <div className="space-y-1.5">
            <Label htmlFor="climate-zone">Climate Zone</Label>
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
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Floorplan</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary hover:bg-primary/5"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="mb-3 size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Click to upload or drag & drop</p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, PNG, JPG, JPEG, or WebP
            </p>
          </div>
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
