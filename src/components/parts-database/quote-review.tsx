"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import type { ParsedQuoteResult, ParsedLineItem, EquipmentType } from "@/types/catalog";
import { EQUIPMENT_TYPE_LABELS } from "@/types/catalog";

interface EditableLineItem extends ParsedLineItem {
  selected: boolean;
}

interface QuoteReviewProps {
  parsedResult: ParsedQuoteResult;
  supplierId: string;
  fileName: string;
  onSave: () => void;
  onCancel: () => void;
}

export function QuoteReview({
  parsedResult,
  supplierId,
  fileName,
  onSave,
  onCancel,
}: QuoteReviewProps) {
  const [lineItems, setLineItems] = useState<EditableLineItem[]>(
    parsedResult.line_items.map((item) => ({ ...item, selected: true }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem<K extends keyof EditableLineItem>(
    index: number,
    key: K,
    value: EditableLineItem[K]
  ) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  }

  function toggleAll(checked: boolean) {
    setLineItems((prev) => prev.map((item) => ({ ...item, selected: checked })));
  }

  const allSelected = lineItems.every((item) => item.selected);
  const someSelected = lineItems.some((item) => item.selected);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) throw new Error("Not authenticated");

      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          user_id: user.id,
          supplier_id: supplierId,
          quote_number: parsedResult.quote_number,
          quote_date: parsedResult.quote_date || null,
          subtotal: parsedResult.subtotal,
          tax: parsedResult.tax,
          total: parsedResult.total,
          file_name: fileName,
          storage_path: "",
          status: "reviewing",
        })
        .select("id")
        .single();

      if (quoteError || !quoteData) {
        throw new Error(quoteError?.message ?? "Failed to create quote record");
      }

      const quoteId = quoteData.id;

      const selectedItems = lineItems.filter((item) => item.selected);

      for (const item of selectedItems) {
        let catalogItemId: string;

        const { data: existing } = await supabase
          .from("equipment_catalog")
          .select("id, usage_count")
          .eq("user_id", user.id)
          .eq("model_number", item.model_number.trim())
          .maybeSingle();

        if (existing) {
          const { error: updateError } = await supabase
            .from("equipment_catalog")
            .update({
              unit_price: item.unit_price,
              usage_count: (existing.usage_count ?? 0) + 1,
              last_quoted_date: parsedResult.quote_date || null,
            })
            .eq("id", existing.id);

          if (updateError) throw new Error(updateError.message);
          catalogItemId = existing.id;
        } else {
          const { data: newItem, error: insertError } = await supabase
            .from("equipment_catalog")
            .insert({
              user_id: user.id,
              supplier_id: supplierId,
              model_number: item.model_number.trim(),
              description: item.description,
              equipment_type: item.equipment_type,
              system_type: "universal",
              brand: item.brand,
              tonnage: item.tonnage,
              seer_rating: item.seer_rating,
              btu_capacity: item.btu_capacity,
              stages: item.stages,
              refrigerant_type: item.refrigerant_type,
              unit_price: item.unit_price,
              source: "quote",
              last_quoted_date: parsedResult.quote_date || null,
            })
            .select("id")
            .single();

          if (insertError || !newItem) throw new Error(insertError?.message ?? "Failed to insert catalog item");
          catalogItemId = newItem.id;
        }

        const { error: lineError } = await supabase.from("quote_lines").insert({
          quote_id: quoteId,
          catalog_item_id: catalogItemId,
          model_number: item.model_number.trim(),
          description: item.description,
          equipment_type: item.equipment_type,
          brand: item.brand,
          tonnage: item.tonnage,
          seer_rating: item.seer_rating,
          btu_capacity: item.btu_capacity,
          stages: item.stages,
          refrigerant_type: item.refrigerant_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          extended_price: item.extended_price,
          selected: true,
        });

        if (lineError) throw new Error(lineError.message);

        if (item.unit_price !== null) {
          const { error: historyError } = await supabase.from("price_history").insert({
            catalog_item_id: catalogItemId,
            supplier_id: supplierId,
            price: item.unit_price,
            quote_date: parsedResult.quote_date || null,
            quote_id: quoteId,
          });

          if (historyError) throw new Error(historyError.message);
        }
      }

      const { error: statusError } = await supabase
        .from("quotes")
        .update({ status: "saved" })
        .eq("id", quoteId);

      if (statusError) throw new Error(statusError.message);

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quote");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Review Quote</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Supplier</p>
              <p className="text-sm font-medium">{parsedResult.supplier_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quote #</p>
              <p className="text-sm font-medium">{parsedResult.quote_number || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="text-sm font-medium">{parsedResult.quote_date || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                </TableHead>
                <TableHead>Model #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Tons</TableHead>
                <TableHead>SEER</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Ext. Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => updateItem(index, "selected", e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.model_number}
                      onChange={(e) => updateItem(index, "model_number", e.target.value)}
                      className="h-7 min-w-[100px] text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      className="h-7 min-w-[160px] text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.equipment_type}
                      onValueChange={(val) =>
                        updateItem(index, "equipment_type", val as EquipmentType)
                      }
                    >
                      <SelectTrigger className="h-7 min-w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(EQUIPMENT_TYPE_LABELS) as [EquipmentType, string][]).map(
                          ([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.brand}
                      onChange={(e) => updateItem(index, "brand", e.target.value)}
                      className="h-7 min-w-[80px] text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={item.tonnage ?? ""}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "tonnage",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      className="h-7 w-16 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={item.seer_rating ?? ""}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "seer_rating",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      className="h-7 w-16 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(index, "quantity", parseInt(e.target.value, 10) || 1)
                      }
                      className="h-7 w-14 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unit_price ?? ""}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "unit_price",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      className="h-7 w-20 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.extended_price ?? ""}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "extended_price",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      className="h-7 w-20 text-xs"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || !someSelected}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save to Catalog"}
        </Button>
      </div>
    </div>
  );
}
