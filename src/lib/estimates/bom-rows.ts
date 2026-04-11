import type { BomItem } from "@/types/hvac";

export function toBomInsertRows(items: BomItem[], estimateId: string) {
  return items.map((item) => ({
    estimate_id: estimateId,
    category: item.category,
    description: item.name,
    quantity: item.qty,
    unit: item.unit,
    unit_cost: item.price ?? 0,
    total_cost: (item.price ?? 0) * item.qty,
    part_id: item.partId || null,
    supplier: item.supplier || null,
    sku: item.sku || null,
    notes: item.notes ?? "",
    source: item.source,
  }));
}
