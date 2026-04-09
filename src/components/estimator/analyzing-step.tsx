"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import type { AnalysisResult } from "@/types/hvac";

export function AnalyzingStep() {
  const {
    pdfPages,
    selectedPages,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    setAnalysisResult,
    setError,
    setStep,
  } = useEstimator();

  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function analyze() {
      const selectedPageData = pdfPages.filter((p) =>
        selectedPages.includes(p.pageNum)
      );

      const images = selectedPageData.map((p) => ({
        base64: p.base64,
        mediaType: p.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        pageNum: p.pageNum,
      }));

      const buildingInfo: Record<string, unknown> = {};
      if (knownTotalSqft) {
        const sqft = parseFloat(knownTotalSqft);
        if (!isNaN(sqft) && sqft > 0) buildingInfo.totalSqft = sqft;
      }
      if (knownUnits > 1) {
        buildingInfo.units = knownUnits;
        buildingInfo.hvacPerUnit = hvacPerUnit;
      }

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images,
            ...(Object.keys(buildingInfo).length > 0 ? { buildingInfo } : {}),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Analysis failed" }));
          throw new Error((err as { error?: string }).error ?? "Analysis failed");
        }

        const result = (await res.json()) as AnalysisResult;
        setAnalysisResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
        setStep("select_pages");
      }
    }

    analyze();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <Loader2 className="size-10 animate-spin text-primary" />
      <p className="text-lg font-medium">Analyzing floorplan...</p>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Claude is reviewing your floorplan to identify rooms and recommend HVAC
        sizing. This usually takes 15–30 seconds.
      </p>
    </div>
  );
}
