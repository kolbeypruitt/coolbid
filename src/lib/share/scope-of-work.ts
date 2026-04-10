import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

const SYSTEM_LABELS: Record<EstimateRow["system_type"], string> = {
  heat_pump: "heat pump",
  gas_ac: "gas furnace and AC",
  electric: "electric furnace and AC",
  dual_fuel: "dual-fuel system",
};

/**
 * Produce a clean one-sentence scope of work from an estimate and its BOM.
 * Deterministic — no AI. Contractor can edit it in the share dialog.
 */
export function generateScopeOfWork(
  estimate: EstimateRow,
  bom: BomRow[],
): string {
  const systemLabel = SYSTEM_LABELS[estimate.system_type] ?? "HVAC system";
  const sqftPart =
    estimate.total_sqft != null
      ? ` sized for ${estimate.total_sqft.toLocaleString()} sq ft`
      : "";
  const zonePart = estimate.climate_zone
    ? `, Zone ${estimate.climate_zone}`
    : "";

  return `HVAC system installation — ${systemLabel}${sqftPart}${zonePart}. Includes ductwork, line set, labor, and disposal.`;
}
