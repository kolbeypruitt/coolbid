"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import { Card, CardContent } from "@/components/ui/card";
import type { AnalysisResult } from "@/types/hvac";

const STEPS = [
  "Rendering selected pages at high resolution...",
  "Uploading floorplan pages...",
  "Detecting walls and room boundaries...",
  "Reading dimension annotations...",
  "Identifying room types...",
  "Computing heat load requirements...",
  "Generating room report...",
];

// Hold back the last step until the API responds.
// Each step takes 3-4.5s so 6 steps ≈ 18-27s — right in the API wait range.
const HOLD_AT = STEPS.length - 2; // pause before "Generating room report..."
const STEP_MIN_MS = 3000;
const STEP_JITTER_MS = 1500;

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
  const [visibleStep, setVisibleStep] = useState(0);
  const [done, setDone] = useState(false);
  const resultRef = useRef<AnalysisResult | null>(null);
  const apiFinishedRef = useRef(false);

  useEffect(() => {
    if (done) return;

    // If we're at the hold point and API isn't done, wait and retry
    if (visibleStep >= HOLD_AT && !apiFinishedRef.current) {
      const check = setInterval(() => {
        if (apiFinishedRef.current) {
          clearInterval(check);
          setVisibleStep((s) => s + 1);
        }
      }, 400);
      return () => clearInterval(check);
    }

    // If we've shown all steps, mark done
    if (visibleStep >= STEPS.length - 1) {
      const timeout = setTimeout(() => setDone(true), 1200);
      return () => clearTimeout(timeout);
    }

    // Schedule next step
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
          const err = await res
            .json()
            .catch(() => ({ error: "Analysis failed" }));
          throw new Error(
            (err as { error?: string }).error ?? "Analysis failed"
          );
        }

        const result = (await res.json()) as AnalysisResult;
        resultRef.current = result;
        apiFinishedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
        setStep("select_pages");
      }
    }

    analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = done || (visibleStep >= STEPS.length - 1 && apiFinishedRef.current);
  const progress = allDone
    ? 100
    : Math.round(((visibleStep + 1) / STEPS.length) * 85);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-10 text-center">
      <h2 className="text-xl font-semibold">Analyzing Floorplan...</h2>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
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
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : null}
                  <span className={isDone ? "text-muted-foreground" : "text-foreground"}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
