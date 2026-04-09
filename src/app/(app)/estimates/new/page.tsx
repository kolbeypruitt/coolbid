"use client";

import { useEstimator } from "@/hooks/use-estimator";
import { Badge } from "@/components/ui/badge";
import { UploadStep } from "@/components/estimator/upload-step";
import { PageSelectStep } from "@/components/estimator/page-select-step";
import { AnalyzingStep } from "@/components/estimator/analyzing-step";
import { RoomsStep } from "@/components/estimator/rooms-step";
import { BomStep } from "@/components/estimator/bom-step";

const STEPS = [
  { key: "upload", label: "Upload" },
  { key: "select_pages", label: "Select Pages" },
  { key: "analyzing", label: "Analyzing" },
  { key: "rooms", label: "Rooms" },
  { key: "bom", label: "BOM" },
] as const;

export default function NewEstimatePage() {
  const { step, error } = useEstimator();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      {/* Step Indicator */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <Badge
            key={s.key}
            variant={step === s.key ? "default" : "outline"}
          >
            {s.label}
          </Badge>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step Content */}
      {step === "upload" && <UploadStep />}
      {step === "select_pages" && <PageSelectStep />}
      {step === "analyzing" && <AnalyzingStep />}
      {step === "rooms" && <RoomsStep />}
      {step === "bom" && <BomStep />}
    </div>
  );
}
