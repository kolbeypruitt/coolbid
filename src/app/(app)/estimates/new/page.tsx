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
      <h1 className="text-2xl font-bold text-txt-primary">New Estimate</h1>

      {/* Step Indicator */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <Badge
            key={s.key}
            variant={step === s.key ? "default" : "outline"}
            className={step === s.key ? "bg-gradient-brand text-white border-none" : "bg-bg-card text-txt-secondary border-border"}
          >
            {s.label}
          </Badge>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm bg-error-bg border-error text-error">
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
