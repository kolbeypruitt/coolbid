"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateRFQText, generateRFQCSV, type RfqConfig } from "@/lib/hvac/rfq";
import { regenerateBom } from "@/lib/estimates/regenerate-bom";
import type { BomResult } from "@/types/hvac";

interface EstimateActionsProps {
  bom: BomResult;
  rfqConfig: RfqConfig;
  projectName: string;
  estimateId: string;
}

export function EstimateActions({
  bom,
  rfqConfig,
  projectName,
  estimateId,
}: EstimateActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCopyRFQ() {
    const text = generateRFQText(bom, rfqConfig);
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function handleExportCSV() {
    const csv = generateRFQCSV(bom);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "_")}_BOM.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRegenerateBom() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateBom(estimateId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleCopyRFQ}>
          <FileText className="mr-2 h-4 w-4" />
          Copy RFQ
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerateBom}
          disabled={isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? "Regenerating…" : "Regenerate BOM"}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
