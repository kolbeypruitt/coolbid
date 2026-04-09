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

  const [{ data: estimate }, { data: rooms }, { data: bomItems }] =
    await Promise.all([
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
    ]);

  if (!estimate) {
    notFound();
  }

  const est = estimate as EstimateRow;
  const roomList = (rooms ?? []) as RoomRow[];
  const bom = (bomItems ?? []) as BomRow[];

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
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-0.5")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{est.project_name}</h1>
            <Badge variant={statusVariant(est.status)}>{est.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{est.customer_name}</p>
          {est.total_sqft != null && (
            <p className="text-sm text-muted-foreground">
              {est.total_sqft.toLocaleString()} sq ft
            </p>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Materials</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${materialCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Labor</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${laborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{margin}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${totalPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rooms Table */}
      {roomList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rooms</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Sq Ft</TableHead>
                  <TableHead className="text-right">Windows</TableHead>
                  <TableHead className="text-right">Ext Walls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roomList.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium">{room.name}</TableCell>
                    <TableCell>{formatRoomType(room.type)}</TableCell>
                    <TableCell className="text-right">
                      {room.sqft != null ? room.sqft.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {room.window_count}
                    </TableCell>
                    <TableCell className="text-right">
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
        <Card key={category}>
          <CardHeader>
            <CardTitle>{formatRoomType(category)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.description}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {item.sku ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity} {item.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      ${item.unit_cost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
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
