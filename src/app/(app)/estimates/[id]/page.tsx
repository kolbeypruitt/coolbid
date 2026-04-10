import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatRoomType } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CustomerCard } from "@/components/estimates/customer-card";
import { ShareBlock } from "@/components/estimates/share-block";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

function statusVariant(
  status: EstimateRow["status"]
): "outline" | "secondary" | "default" {
  if (status === "draft") return "outline";
  if (status === "sent") return "secondary";
  return "default";
}


export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: estimate },
    { data: rooms },
    { data: bomItems },
    { data: activeShareData },
  ] = await Promise.all([
    supabase.from("estimates").select("*").eq("id", id).single(),
    supabase
      .from("estimate_rooms")
      .select("*")
      .eq("estimate_id", id)
      .order("created_at"),
    supabase
      .from("estimate_bom_items")
      .select("*")
      .eq("estimate_id", id)
      .order("category"),
    supabase
      .from("estimate_shares")
      .select("*")
      .eq("estimate_id", id)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);

  if (!estimate) {
    notFound();
  }

  const est = estimate as EstimateRow;
  const roomList = (rooms ?? []) as RoomRow[];
  const bom = (bomItems ?? []) as BomRow[];
  const activeShare = (activeShareData ?? null) as
    | Database["public"]["Tables"]["estimate_shares"]["Row"]
    | null;

  const hasUnpricedItems = bom.some(
    (item) => item.source === "missing" || (item.unit_cost === 0 && item.source !== "labor"),
  );

  const materialCost = bom.reduce((sum, item) => sum + item.total_cost, 0);
  const laborCost = est.labor_rate * est.labor_hours;
  const margin = est.profit_margin;
  const totalPrice = est.total_price ?? 0;

  // Group BOM by category
  const bomByCategory: Record<string, BomRow[]> = {};
  for (const item of bom) {
    if (!bomByCategory[item.category]) {
      bomByCategory[item.category] = [];
    }
    bomByCategory[item.category].push(item);
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/estimates"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-0.5 text-txt-secondary hover:text-txt-primary")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-txt-primary">{est.project_name}</h1>
            <Badge variant={statusVariant(est.status)}>{est.status}</Badge>
          </div>
          <p className="text-sm text-txt-secondary mt-1">{est.customer_name}</p>
          {est.total_sqft != null && (
            <p className="text-sm text-txt-secondary">
              {est.total_sqft.toLocaleString()} sq ft
            </p>
          )}
        </div>
        <ShareBlock estimate={est} activeShare={activeShare} hasUnpricedItems={hasUnpricedItems} />
      </div>

      {/* Customer */}
      <CustomerCard
        estimateId={est.id}
        customer_name={est.customer_name}
        job_address={est.job_address}
        customer_email={est.customer_email}
        customer_phone={est.customer_phone}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="bg-gradient-card border-b-accent">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-txt-tertiary">Materials</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-txt-primary">
              ${materialCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-card border-b-accent">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-txt-tertiary">Labor</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-txt-primary">
              ${laborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-card border-b-accent">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-txt-tertiary">Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-txt-primary">{margin}%</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-card border-b-accent">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-txt-tertiary">Total Price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold text-gradient-brand">
              ${totalPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rooms Table */}
      {roomList.length > 0 && (
        <Card className="bg-gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-txt-primary">Rooms</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">Name</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">Type</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">Sq Ft</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">Windows</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">Ext Walls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roomList.map((room) => (
                  <TableRow key={room.id} className="border-b border-border hover:bg-[rgba(6,182,212,0.03)] transition-colors">
                    <TableCell className="text-sm text-txt-secondary py-2 tabular-nums text-txt-primary font-medium">{room.name}</TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2">{formatRoomType(room.type)}</TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2 tabular-nums text-txt-primary font-medium text-right">
                      {room.sqft != null ? room.sqft.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2 tabular-nums text-txt-primary font-medium text-right">
                      {room.window_count}
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2 tabular-nums text-txt-primary font-medium text-right">
                      {room.exterior_walls}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* BOM Tables grouped by category */}
      {Object.entries(bomByCategory).map(([category, items]) => (
        <Card key={category} className="bg-gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-txt-primary">{formatRoomType(category)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">Description</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">SKU</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">Qty</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">Unit Cost</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="border-b border-border hover:bg-[rgba(6,182,212,0.03)] transition-colors">
                    <TableCell className="text-sm text-txt-secondary py-2 text-txt-primary font-medium">
                      {item.description}
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2">
                      {item.sku ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2 tabular-nums text-txt-primary font-medium text-right">
                      {item.quantity} {item.unit}
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2 tabular-nums text-txt-primary font-medium text-right">
                      ${item.unit_cost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2 tabular-nums text-txt-primary font-medium text-right">
                      ${item.total_cost.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
