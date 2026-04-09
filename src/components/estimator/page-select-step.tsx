"use client";

import Image from "next/image";
import { useEstimator } from "@/hooks/use-estimator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageSelectStep() {
  const {
    pdfPages,
    selectedPages,
    setSelectedPages,
    setStep,
  } = useEstimator();

  const isSingle = pdfPages.length === 1;

  function togglePage(pageNum: number) {
    if (selectedPages.includes(pageNum)) {
      setSelectedPages(selectedPages.filter((p) => p !== pageNum));
    } else {
      setSelectedPages([...selectedPages, pageNum]);
    }
  }

  function handleAnalyze() {
    setStep("analyzing");
  }

  if (isSingle) {
    const page = pdfPages[0];
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border">
          <Image
            src={page.previewUrl}
            alt="Floorplan preview"
            width={800}
            height={600}
            className="h-auto w-full object-contain"
            unoptimized
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep("upload")}>
            Back
          </Button>
          <Button onClick={handleAnalyze}>Analyze Floorplan</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select the pages containing floor plans to analyze.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {pdfPages.map((page) => {
          const isSelected = selectedPages.includes(page.pageNum);
          return (
            <button
              key={page.pageNum}
              onClick={() => togglePage(page.pageNum)}
              className={cn(
                "flex flex-col overflow-hidden rounded-lg border-2 transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              )}
            >
              <Image
                src={page.previewUrl}
                alt={`Page ${page.pageNum}`}
                width={400}
                height={300}
                className="h-auto w-full object-contain"
                unoptimized
              />
              <span className="py-1.5 text-center text-xs font-medium">
                Page {page.pageNum}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep("upload")}>
          Back
        </Button>
        <Button onClick={handleAnalyze} disabled={selectedPages.length === 0}>
          Analyze {selectedPages.length > 0 ? `${selectedPages.length} Page${selectedPages.length > 1 ? "s" : ""}` : "Pages"}
        </Button>
      </div>
    </div>
  );
}
