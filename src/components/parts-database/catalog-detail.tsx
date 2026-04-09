"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type CatalogItem,
  type PriceHistoryEntry,
  EQUIPMENT_TYPE_LABELS,
  SYSTEM_TYPE_LABELS,
} from "@/types/catalog";

type DetailResponse = CatalogItem & {
  price_history?: PriceHistoryEntry[];
};

type EditableFields = {
  model_number: string;
  description: string;
  brand: string;
  tonnage: string;
  seer_rating: string;
  unit_price: string;
};

const SOURCE_BADGE: Record<
  CatalogItem["source"],
  { label: string; variant: "outline" | "default" | "secondary" }
> = {
  starter: { label: "Starter", variant: "outline" },
  quote: { label: "Quoted", variant: "default" },
  manual: { label: "Manual", variant: "secondary" },
};

function toEditableFields(item: CatalogItem): EditableFields {
  return {
    model_number: item.model_number ?? "",
    description: item.description ?? "",
    brand: item.brand ?? "",
    tonnage: item.tonnage != null ? String(item.tonnage) : "",
    seer_rating: item.seer_rating != null ? String(item.seer_rating) : "",
    unit_price: item.unit_price != null ? String(item.unit_price) : "",
  };
}

interface CatalogDetailProps {
  itemId: string;
}

export function CatalogDetail({ itemId }: CatalogDetailProps) {
  const router = useRouter();
  const [item, setItem] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<EditableFields>({
    model_number: "",
    description: "",
    brand: "",
    tonnage: "",
    seer_rating: "",
    unit_price: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/catalog/${itemId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load item (${res.status})`);
        return res.json() as Promise<DetailResponse>;
      })
      .then((data) => {
        setItem(data);
        setFields(toEditableFields(data));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load item");
      })
      .finally(() => setLoading(false));
  }, [itemId]);

  function handleFieldChange(key: keyof EditableFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    setSaveError(null);
    try {
      const parsedTonnage = parseFloat(fields.tonnage);
      const parsedSeer = parseFloat(fields.seer_rating);
      const parsedPrice = parseFloat(fields.unit_price);
      const body: Record<string, string | number | null> = {
        model_number: fields.model_number.trim() || null,
        description: fields.description.trim() || null,
        brand: fields.brand.trim() || null,
        tonnage:
          fields.tonnage.trim() !== ""
            ? (isNaN(parsedTonnage) ? item.tonnage : parsedTonnage)
            : null,
        seer_rating:
          fields.seer_rating.trim() !== ""
            ? (isNaN(parsedSeer) ? item.seer_rating : parsedSeer)
            : null,
        unit_price:
          fields.unit_price.trim() !== ""
            ? (isNaN(parsedPrice) ? item.unit_price : parsedPrice)
            : null,
      };
      const res = await fetch(`/api/catalog/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      const updated = (await res.json()) as DetailResponse;
      setItem(updated);
      setFields(toEditableFields(updated));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/catalog/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      router.push("/parts-database");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div role="status" className="py-20 text-center text-sm text-txt-secondary">
        Loading…
      </div>
    );
  }

  if (error || !item) {
    return (
      <div role="alert" className="py-20 text-center text-sm text-destructive">
        {error ?? "Item not found."}
      </div>
    );
  }

  const src = SOURCE_BADGE[item.source];
  const systemLabel =
    item.system_type === "universal"
      ? "Universal"
      : (SYSTEM_TYPE_LABELS[item.system_type] ?? item.system_type);

  const priceHistory = (item.price_history ?? []).slice().sort((a, b) => {
    const da = a.quote_date ?? a.created_at;
    const db = b.quote_date ?? b.created_at;
    return db.localeCompare(da);
  });

  return (
    <div className="space-y-6 p-6">
      {/* Attributes */}
      <Card className="bg-gradient-card border-b-accent">
        <CardHeader>
          <CardTitle className="text-txt-primary">{item.description || item.model_number || "Item Detail"}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Equipment Type</dt>
              <dd className="text-txt-primary font-medium">{EQUIPMENT_TYPE_LABELS[item.equipment_type] ?? item.equipment_type}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">System Type</dt>
              <dd className="text-txt-primary font-medium">{systemLabel}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Tonnage</dt>
              <dd className="text-txt-primary font-medium">{item.tonnage != null ? `${item.tonnage} ton` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">SEER</dt>
              <dd className="text-txt-primary font-medium">{item.seer_rating ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">BTU</dt>
              <dd className="text-txt-primary font-medium">{item.btu_capacity ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Stages</dt>
              <dd className="text-txt-primary font-medium">{item.stages ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Refrigerant</dt>
              <dd className="text-txt-primary font-medium">{item.refrigerant_type ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Price</dt>
              <dd className="text-txt-primary font-medium">
                {item.unit_price != null
                  ? `$${item.unit_price.toFixed(2)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Supplier</dt>
              <dd className="text-txt-primary font-medium">{item.supplier?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Source</dt>
              <dd>
                <Badge variant={src.variant}>{src.label}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Usage Count</dt>
              <dd className="text-txt-primary font-medium">{item.usage_count}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Edit */}
      <Card>
        <CardHeader>
          <CardTitle>Edit</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                { key: "model_number", label: "Model Number" },
                { key: "description", label: "Description" },
                { key: "brand", label: "Brand" },
                { key: "tonnage", label: "Tonnage" },
                { key: "seer_rating", label: "SEER Rating" },
                { key: "unit_price", label: "Unit Price ($)" },
              ] as { key: keyof EditableFields; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor={`field-${key}`}>
                  {label}
                </label>
                <Input
                  id={`field-${key}`}
                  value={fields[key]}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>

          {saveError && (
            <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {saveError}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete Item"}
            </Button>
            <Button className="bg-gradient-brand hover-lift" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Price History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-txt-primary">Price History</CardTitle>
        </CardHeader>
        <CardContent>
          {priceHistory.length === 0 ? (
            <p className="text-sm text-txt-secondary">No price history yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border bg-bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card">Date</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary py-3 px-3 bg-bg-card text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceHistory.map((entry) => (
                  <TableRow key={entry.id} className="hover:bg-[rgba(6,182,212,0.03)] transition-colors border-b border-border">
                    <TableCell className="text-sm text-txt-secondary py-3 px-3">
                      {entry.quote_date
                        ? new Date(entry.quote_date).toLocaleDateString()
                        : new Date(entry.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm py-3 px-3 tabular-nums text-txt-primary font-medium text-right">
                      ${entry.price.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
