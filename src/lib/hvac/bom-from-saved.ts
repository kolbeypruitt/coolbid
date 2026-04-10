import type { BomResult, BomItem, BomSummary } from "@/types/hvac";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];

/**
 * Reconstruct a BomResult from saved DB rows so the RFQ generators
 * (which expect the in-memory BomItem/BomSummary shape) can work
 * on already-saved estimates.
 */
export function reconstructBomResult(
  estimate: EstimateRow,
  bomRows: BomRow[],
  roomRows: RoomRow[],
): BomResult {
  const items: BomItem[] = bomRows.map((row) => ({
    partId: row.part_id ?? "",
    name: row.description,
    category: row.category,
    qty: row.quantity,
    unit: row.unit,
    price: row.unit_cost,
    supplier: row.supplier ?? "",
    sku: row.sku ?? "",
    notes: row.notes,
    source: (row.source as BomItem["source"]) ?? "missing",
    brand: "",
  }));

  const designBTU = roomRows.reduce(
    (sum, r) => sum + (r.btu_load ?? 0),
    0,
  );
  const tonnage = roomRows.reduce(
    (sum, r) => sum + (r.tonnage ?? 0),
    0,
  ) || (estimate.total_sqft ? Math.ceil((estimate.total_sqft * 25) / 12000) : 0);

  const summary: BomSummary = {
    designBTU,
    tonnage,
    totalCFM: roomRows.reduce((sum, r) => sum + (r.cfm_required ?? 0), 0),
    totalRegs: 0,
    retCount: 0,
    condSqft: 0,
    zones: estimate.num_units,
  };

  return { items, summary, roomLoads: [] };
}
