"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import { Card, CardContent } from "@/components/ui/card";
import type { AnalysisResult } from "@/types/hvac";

const STEPS = [
  "Scanning document with OCR...",
  "Extracting room boundaries from floor plan...",
  "Detecting walls and computing adjacency...",
  "Reading dimension annotations...",
  "Labeling rooms and matching polygons...",
  "Computing heat load requirements...",
  "Generating room report...",
];

// Hold back the last step until the API responds.
const HOLD_AT = STEPS.length - 2;
const STEP_MIN_MS = 3000;
const STEP_JITTER_MS = 1500;

export function AnalyzingStep() {
  const {
    pdfPages,
    selectedPages,
    rawFile,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    setAnalysisResult,
    setError,
    setStep,
  } = useEstimator();

  const hasRun = useRef(false);
  const [visibleStep, setVisibleStep] = useState(0);
  const [done, setDone] = useState(false);
  const resultRef = useRef<AnalysisResult | null>(null);
  const apiFinishedRef = useRef(false);

  useEffect(() => {
    if (done) return;

    if (visibleStep >= HOLD_AT && !apiFinishedRef.current) {
      const check = setInterval(() => {
        if (apiFinishedRef.current) {
          clearInterval(check);
          setVisibleStep((s) => s + 1);
        }
      }, 400);
      return () => clearInterval(check);
    }

    if (visibleStep >= STEPS.length - 1) {
      const timeout = setTimeout(() => setDone(true), 1200);
      return () => clearTimeout(timeout);
    }

    const delay = STEP_MIN_MS + Math.random() * STEP_JITTER_MS;
    const timeout = setTimeout(() => {
      setVisibleStep((s) => s + 1);
    }, delay);
    return () => clearTimeout(timeout);
  }, [visibleStep, done]);

  useEffect(() => {
    if (done && resultRef.current) {
      setAnalysisResult(resultRef.current);
    }
  }, [done, setAnalysisResult]);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function analyze() {
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
        // Primary path: Document AI OCR
        let result: AnalysisResult | null = null;

        if (rawFile) {
          result = await tryDocumentAi(rawFile, buildingInfo);
        }

        // Fallback: existing vision-based analysis
        if (!result) {
          result = await visionAnalysis(buildingInfo);
        }

        if (result) {
          resultRef.current = result;
          apiFinishedRef.current = true;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
        setStep("select_pages");
      }
    }

    async function tryDocumentAi(
      file: File,
      buildingInfo: Record<string, unknown>
    ): Promise<AnalysisResult | null> {
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (Object.keys(buildingInfo).length > 0) {
          formData.append("buildingInfo", JSON.stringify(buildingInfo));
        }
        formData.append("selectedPages", JSON.stringify(selectedPages));

        // Include base64 page images so Claude can see rotated text OCR misses
        const selectedPageData = pdfPages.filter((p) =>
          selectedPages.includes(p.pageNum)
        );
        const images = selectedPageData.map((p) => ({
          base64: p.base64,
          mediaType: p.mediaType,
          pageNum: p.pageNum,
        }));
        formData.append("images", JSON.stringify(images));

        const res = await fetch("/api/analyze-docai", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          if (res.status === 402) {
            const err = await res.json().catch(() => ({ error: "Analysis failed" }));
            throw new Error((err as { error?: string }).error ?? "Analysis failed");
          }
          if (res.status === 422) {
            const err = await res.json().catch(() => ({ error: "Analysis failed" }));
            const errorMsg = (err as { error?: string }).error ?? "Analysis failed";
            if ((err as { code?: string }).code === "geometry_failed") {
              throw new Error(errorMsg);
            }
          }
          return null;
        }

        const data = await res.json();
        if (data.fallback) return null;

        return data as AnalysisResult;
      } catch (err) {
        // Re-throw billing errors
        if (err instanceof Error && err.message.includes("limit")) throw err;
        console.warn("Document AI path failed, falling back to vision:", err);
        return null;
      }
    }

    async function visionAnalysis(
      buildingInfo: Record<string, unknown>
    ): Promise<AnalysisResult> {
      const selectedPageData = pdfPages.filter((p) =>
        selectedPages.includes(p.pageNum)
      );

      const images = selectedPageData.map((p) => ({
        base64: p.base64,
        mediaType: p.mediaType as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
        pageNum: p.pageNum,
      }));

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          ...(Object.keys(buildingInfo).length > 0 ? { buildingInfo } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Analysis failed" }));
        throw new Error(
          (err as { error?: string }).error ?? "Analysis failed"
        );
      }

      return (await res.json()) as AnalysisResult;
    }

    analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = done || (visibleStep >= STEPS.length - 1 && apiFinishedRef.current);
  const progress = allDone
    ? 100
    : Math.round(((visibleStep + 1) / STEPS.length) * 85);

  return (
    <div className="max-w-[600px] mx-auto py-10">
      <div className="space-y-6 text-center">
        <div className="pulse-ring relative w-16 h-16 rounded-full flex items-center justify-center mx-auto">
          <h2 className="sr-only">Analyzing Floorplan...</h2>
        </div>
        <h2 className="text-xl font-semibold">Analyzing Floorplan...</h2>

        <Card className="bg-gradient-card border-border">
          <CardContent className="space-y-4 pt-6">
            <div className="h-2 w-full overflow-hidden rounded-full bg-bg-card">
              <div
                className="h-full rounded-full progress-fill transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="space-y-3 text-left">
              {STEPS.slice(0, visibleStep + 1).map((step, i) => {
                const isDone = i < visibleStep || allDone;
                const isCurrent = i === visibleStep && !allDone;

                return (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    {isDone ? (
                      <Check className="h-4 w-4 shrink-0 text-success" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-light" />
                    ) : null}
                    <span className={isDone ? "text-txt-secondary" : isCurrent ? "text-txt-primary font-medium" : "text-txt-secondary"}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
