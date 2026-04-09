"use client";

import { useRouter } from "next/navigation";
import { Save, FileText, Download } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import { generateRFQText, generateRFQCSV } from "@/lib/hvac/rfq";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { BomItem } from "@/types/hvac";

type BomCategory = {
  category: string;
  items: BomItem[];
};

export function BomStep() {
  const router = useRouter();
  const {
    bom,
    rooms,
    profitMargin,
    laborRate,
    laborHours,
    projectName,
    customerName,
    supplierName,
    climateZone,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    setFinancials,
    setProjectInfo,
    setStep,
    setError,
  } = useEstimator();

  if (!bom) return null;

  const materialCost = bom.items.reduce((sum, item) => sum + (item.price ?? 0) * item.qty, 0);
  const laborCost = laborRate * laborHours;
  const subtotal = materialCost + laborCost;
  const markup = subtotal * (profitMargin / 100);
  const totalPrice = subtotal + markup;

  // Group items by category
  const byCategory = new Map<string, BomCategory["items"]>();
  for (const item of bom.items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category)!.push(item);
  }
  const categories = Array.from(byCategory.entries()).map(([category, items]) => ({
    category,
    items,
  }));

  function handleCopyRFQ() {
    const text = generateRFQText(bom!, {
      companyName: "My HVAC Company",
      companyPhone: "",
      companyEmail: "",
      supplierName,
      projectName,
      customerName,
    });
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function handleExportCSV() {
    const csv = generateRFQCSV(bom!);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "_")}_BOM.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave() {
    const currentBom = bom;
    if (!currentBom) return;
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error("Not authenticated");

      const { data: estimate, error: estErr } = await supabase
        .from("estimates")
        .insert({
          user_id: user.id,
          project_name: projectName.trim() || "New Estimate",
          customer_name: customerName.trim() || "",
          status: "draft",
          total_sqft: knownTotalSqft ? parseFloat(knownTotalSqft) || null : null,
          num_units: knownUnits,
          hvac_per_unit: hvacPerUnit,
          climate_zone: climateZone,
          profit_margin: profitMargin,
          labor_rate: laborRate,
          labor_hours: laborHours,
          supplier_name: supplierName.trim() || "",
          total_material_cost: materialCost,
          total_price: totalPrice,
        })
        .select("id")
        .single();

      if (estErr || !estimate) throw new Error(estErr?.message ?? "Failed to create estimate");

      const estimateId = estimate.id as string;

      // Insert rooms
      if (rooms.length > 0) {
        const roomRows = rooms.map((r) => ({
          estimate_id: estimateId,
          name: r.name,
          type: r.type,
          floor: r.floor,
          sqft: r.estimated_sqft ?? null,
          length_ft: r.length_ft ?? null,
          width_ft: r.width_ft ?? null,
          ceiling_height: r.ceiling_height,
          window_count: r.window_count,
          exterior_walls: r.exterior_walls,
          notes: r.notes ?? "",
        }));
        const { error: roomErr } = await supabase.from("estimate_rooms").insert(roomRows);
        if (roomErr) throw new Error(roomErr.message);
      }

      // Insert BOM items
      if (currentBom.items.length > 0) {
        const bomRows = currentBom.items.map((item) => ({
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
        const { error: bomErr } = await supabase.from("estimate_bom_items").insert(bomRows);
        if (bomErr) throw new Error(bomErr.message);
      }

      router.push(`/estimates/${estimateId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save estimate");
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-muted-foreground">System Size</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{bom.summary.tonnage}T</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-muted-foreground">Design BTU</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{bom.summary.designBTU.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-muted-foreground">Materials</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${materialCost.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-muted-foreground">Total Price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${totalPrice.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Card */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="profit-margin">Profit Margin (%)</Label>
              <Input
                id="profit-margin"
                type="number"
                min={0}
                max={100}
                value={profitMargin}
                onChange={(e) =>
                  setFinancials({ profitMargin: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="labor-rate">Labor Rate ($/hr)</Label>
              <Input
                id="labor-rate"
                type="number"
                min={0}
                value={laborRate}
                onChange={(e) =>
                  setFinancials({ laborRate: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="labor-hours">Labor Hours</Label>
              <Input
                id="labor-hours"
                type="number"
                min={0}
                value={laborHours}
                onChange={(e) =>
                  setFinancials({ laborHours: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Materials</span>
              <span>${materialCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Labor ({laborHours} hrs @ ${laborRate}/hr)</span>
              <span>${laborCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Markup ({profitMargin}%)</span>
              <span>${markup.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t pt-1.5 font-medium">
              <span>Total</span>
              <span>${totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BOM Tables */}
      {categories.map(({ category, items }) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{category}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 pr-4 font-medium">SKU</th>
                  <th className="pb-2 pr-4 text-right font-medium">Qty</th>
                  <th className="pb-2 pr-4 font-medium">Unit</th>
                  <th className="pb-2 pr-4 text-right font-medium">Price</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4">{item.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{item.sku}</td>
                    <td className="py-2 pr-4 text-right">{item.qty}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{item.unit}</td>
                    <td className="py-2 pr-4 text-right">${(item.price ?? 0).toFixed(2)}</td>
                    <td className="py-2 text-right">${((item.price ?? 0) * item.qty).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      {/* Supplier / RFQ */}
      <Card>
        <CardHeader>
          <CardTitle>RFQ Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-name">Supplier Name</Label>
            <Input
              id="supplier-name"
              value={supplierName}
              onChange={(e) => setProjectInfo({ supplierName: e.target.value })}
              placeholder="Johnstone Supply"
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setStep("rooms")}>
          Back to Rooms
        </Button>
        <Button variant="outline" onClick={handleCopyRFQ}>
          <FileText />
          Copy RFQ
        </Button>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download />
          Export CSV
        </Button>
        <Button onClick={handleSave}>
          <Save />
          Save Estimate
        </Button>
      </div>
    </div>
  );
}
