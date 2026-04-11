"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { Save, FileText, Download, AlertTriangle } from "lucide-react";
import { useEstimator } from "@/hooks/use-estimator";
import { generateRFQText, generateRFQCSV } from "@/lib/hvac/rfq";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import type { BomItem } from "@/types/hvac";
import { toBomInsertRows } from "@/lib/estimates/bom-rows";

type BomCategory = {
  category: string;
  items: BomItem[];
};

function SourceBadge({ source }: { source: BomItem["source"] }) {
  if (source === "starter") {
    return <Badge variant="outline">Starter</Badge>;
  }
  if (source === "quote") {
    return <Badge variant="default" className="bg-green-600 text-white hover:bg-green-700">Quoted</Badge>;
  }
  if (source === "manual") {
    return <Badge variant="default" className="bg-blue-600 text-white hover:bg-blue-700">Manual</Badge>;
  }
  // missing
  return <Badge variant="destructive">Missing</Badge>;
}

export function BomStep() {
  const router = useRouter();
  const {
    bom,
    rooms,
    estimateId,
    profitMargin,
    laborRate,
    laborHours,
    projectName,
    customerName,
    jobAddress,
    customerEmail,
    customerPhone,
    supplierName,
    climateZone,
    systemType,
    knownTotalSqft,
    knownUnits,
    hvacPerUnit,
    setFinancials,
    setProjectInfo,
    setStep,
    setError,
  } = useEstimator();

  if (!bom) return null;

  const hasMissingItems = bom.items.some((item) => item.source === "missing");
  const hasNullPrices = bom.items.some((item) => item.price === null);

  const materialCost = bom.items.reduce(
    (sum, item) => (item.price !== null ? sum + item.price * item.qty : sum),
    0
  );
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

  async function handleFinish() {
    const currentBom = bom;
    if (!currentBom || !estimateId) return;
    setError(null);
    try {
      const supabase = createClient();

      // Update the estimate row with final financials
      const { error: estErr } = await supabase
        .from("estimates")
        .update({
          project_name: projectName.trim() || "New Estimate",
          customer_name: customerName.trim() || "",
          job_address: jobAddress.trim() || null,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          total_sqft: knownTotalSqft ? parseFloat(knownTotalSqft) || null : null,
          num_units: knownUnits,
          hvac_per_unit: hvacPerUnit,
          climate_zone: climateZone,
          system_type: systemType,
          profit_margin: profitMargin,
          labor_rate: laborRate,
          labor_hours: laborHours,
          supplier_name: supplierName.trim() || "",
          total_material_cost: materialCost,
          total_price: totalPrice,
        })
        .eq("id", estimateId);

      if (estErr) throw new Error(estErr.message);

      // Clear and re-insert rooms
      await supabase.from("estimate_rooms").delete().eq("estimate_id", estimateId);
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

      // Clear and re-insert BOM items
      await supabase.from("estimate_bom_items").delete().eq("estimate_id", estimateId);
      if (currentBom.items.length > 0) {
        const bomRows = toBomInsertRows(currentBom.items, estimateId);
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
      {/* Missing items warning banner */}
      {hasMissingItems && (
        <div className="flex items-start gap-3 rounded-lg border p-3 text-sm bg-warning-bg border-warning text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Some equipment couldn&apos;t be found in your catalog. Upload a supplier quote or add items manually to get accurate pricing.
          </span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-gradient-card border-b-accent shadow-[0_0_24px_rgba(6,182,212,0.06)]">
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">System Size</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-txt-primary">{bom.summary.tonnage}T</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-card border-b-accent shadow-[0_0_24px_rgba(6,182,212,0.06)]">
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">Design BTU</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-txt-primary">{bom.summary.designBTU.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-card border-b-accent shadow-[0_0_24px_rgba(6,182,212,0.06)]">
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">Materials</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-txt-primary">${materialCost.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-card border-b-accent shadow-[0_0_24px_rgba(6,182,212,0.06)]">
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">Total Price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold text-gradient-brand">${totalPrice.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Card */}
      <Card className="bg-gradient-card border-border">
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
          <div className="rounded-lg bg-bg-card p-3 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-txt-secondary">
                Materials{hasNullPrices && " (some items need pricing via RFQ)"}
              </span>
              <span className="text-txt-primary">${materialCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-txt-secondary">Labor ({laborHours} hrs @ ${laborRate}/hr)</span>
              <span className="text-txt-primary">${laborCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-txt-secondary">Markup ({profitMargin}%)</span>
              <span className="text-txt-primary">${markup.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t pt-1.5 text-xl font-bold text-txt-primary">
              <span>Total</span>
              <span>${totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BOM Tables */}
      {categories.map(({ category, items }) => (
        <Card key={category} className="bg-gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-txt-primary">{category}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 pr-4">Description</th>
                  <th className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 pr-4">Brand</th>
                  <th className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 pr-4">SKU</th>
                  <th className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 pr-4 text-right">Qty</th>
                  <th className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 pr-4">Unit</th>
                  <th className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 pr-4 text-right">Price</th>
                  <th className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 pr-4 text-right">Total</th>
                  <th className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <Fragment key={i}>
                    <tr className="border-b last:border-0 hover:bg-[rgba(6,182,212,0.03)] transition-colors">
                      <td className="text-txt-secondary py-2 pr-4">{item.name}</td>
                      <td className="text-txt-secondary py-2 pr-4">{item.brand}</td>
                      <td className="text-txt-secondary py-2 pr-4 font-mono text-xs">{item.sku}</td>
                      <td className="tabular-nums text-txt-primary font-medium text-right py-2 pr-4">{item.qty}</td>
                      <td className="text-txt-secondary py-2 pr-4">{item.unit}</td>
                      <td className="tabular-nums text-txt-primary font-medium text-right py-2 pr-4">
                        {item.price === null ? (
                          <span className="text-txt-secondary">RFQ</span>
                        ) : (
                          `$${item.price.toFixed(2)}`
                        )}
                      </td>
                      <td className="tabular-nums text-txt-primary font-medium text-right py-2 pr-4">
                        {item.price === null ? (
                          <span className="text-txt-secondary">—</span>
                        ) : (
                          `$${(item.price * item.qty).toFixed(2)}`
                        )}
                      </td>
                      <td className="py-2">
                        <SourceBadge source={item.source} />
                      </td>
                    </tr>
                    {item.notes && (
                      <tr className="border-b last:border-0">
                        <td colSpan={8} className="py-1.5 pl-4">
                          <span className="flex items-center gap-1.5 text-xs text-warning">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {item.notes}
                          </span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
        <Button onClick={handleFinish} className="bg-gradient-brand hover-lift">
          <Save />
          Done — View Estimate
        </Button>
      </div>
    </div>
  );
}
