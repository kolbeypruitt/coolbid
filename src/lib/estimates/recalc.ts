// src/lib/estimates/recalc.ts
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export function calcTotals(
  bomItems: BomRow[],
  profitMargin: number,
  laborRate: number,
  laborHours: number,
) {
  const materialCost = bomItems.reduce((sum, item) => sum + item.total_cost, 0);
  const laborCost = laborRate * laborHours;
  const subtotal = materialCost + laborCost;
  const markup = subtotal * (profitMargin / 100);
  const totalPrice = subtotal + markup;
  return { materialCost, laborCost, markup, totalPrice };
}

/** Recalculate and persist totals on the estimate row. Flips "sent" → "draft". */
export async function recalcAndSave(
  estimateId: string,
  bomItems: BomRow[],
  profitMargin: number,
  laborRate: number,
  laborHours: number,
  currentStatus: string,
) {
  const { materialCost, totalPrice } = calcTotals(bomItems, profitMargin, laborRate, laborHours);
  const supabase = createClient();
  const updates: Database["public"]["Tables"]["estimates"]["Update"] = {
    total_material_cost: materialCost,
    total_price: totalPrice,
    profit_margin: profitMargin,
    labor_rate: laborRate,
    labor_hours: laborHours,
  };
  if (currentStatus === "sent") {
    updates.status = "draft";
  }
  const { error } = await supabase
    .from("estimates")
    .update(updates)
    .eq("id", estimateId);
  if (error) throw new Error(error.message);
  return { materialCost, totalPrice };
}
