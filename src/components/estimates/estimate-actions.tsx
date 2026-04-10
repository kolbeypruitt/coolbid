"use client";

import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateRFQText, generateRFQCSV, type RfqConfig } from "@/lib/hvac/rfq";
import type { BomResult } from "@/types/hvac";

interface EstimateActionsProps {
  bom: BomResult;
  rfqConfig: RfqConfig;
  projectName: string;
}

export function EstimateActions({
  bom,
  rfqConfig,
  projectName,
}: EstimateActionsProps) {
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

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={handleCopyRFQ}>
        <FileText className="mr-2 h-4 w-4" />
        Copy RFQ
      </Button>
      <Button variant="outline" size="sm" onClick={handleExportCSV}>
        <Download className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );
}
