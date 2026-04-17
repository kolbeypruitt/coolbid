import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
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
import { EstimateActions } from "@/components/estimates/estimate-actions";
import { DeleteEstimateButton } from "@/components/estimates/delete-estimate-button";
import { FinancialsCard } from "@/components/estimates/financials-card";
import { BomCategoryTable } from "@/components/estimates/bom-category-table";
import { compareBomCategories } from "@/lib/hvac/bom-generator";
import { EquipmentPickerDialog } from "@/components/estimates/equipment-picker-dialog";
import type { BomSlot } from "@/lib/hvac/bom-slot-taxonomy";
import type { SystemType } from "@/types/catalog";
import { EmptyBomCard } from "@/components/estimates/empty-bom-card";
import { UnsavedShareBanner } from "@/components/estimates/unsaved-share-banner";
import { FloorplanSchematic } from "@/components/estimates/floorplan-schematic";
import { reconstructBomResult } from "@/lib/hvac/bom-from-saved";
import { generateFloorplanLayout } from "@/lib/hvac/floorplan-layout";
import { calculateRoomLoad, calculateSystemTonnage } from "@/lib/hvac/load-calc";
import type { RoomLoad, ClimateZoneKey, RoomType } from "@/types/hvac";
import { dbRowToRoom } from "@/lib/estimates/db-row-to-room";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: estimate },
    { data: rooms },
    { data: bomItems },
    { data: activeShareData },
    { data: profileData },
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
    user
      ? supabase.from("profiles").select("company_name, company_phone, company_email").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
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

  // Group BOM by category
  const bomByCategory: Record<string, BomRow[]> = {};
  for (const item of bom) {
    if (!bomByCategory[item.category]) {
      bomByCategory[item.category] = [];
    }
    bomByCategory[item.category].push(item);
  }

  // Reconstruct room loads for duct layout schematic
  const climateZone = (est.climate_zone ?? "mixed") as ClimateZoneKey;
  const roomLoads: RoomLoad[] = roomList.map((r, i) =>
    calculateRoomLoad(
      dbRowToRoom(r as Record<string, unknown>, i),
      climateZone,
    ),
  );
  const totalBTU = roomLoads.reduce((s, r) => s + r.btu, 0);
  const tonnage = calculateSystemTonnage(totalBTU);
  const condSqft = roomLoads
    .filter((r) => r.conditioned)
    .reduce((s, r) => s + r.estimated_sqft, 0);
  const layoutSummary = {
    designBTU: Math.ceil(totalBTU * 1.1),
    tonnage,
    totalCFM: roomLoads.reduce((s, r) => s + r.cfm, 0),
    totalRegs: roomLoads.reduce((s, r) => s + r.regs, 0),
    retCount: 0,
    condSqft,
    zones: est.num_units,
  };
  const floorplanLayout =
    roomLoads.length > 0
      ? generateFloorplanLayout(roomLoads, layoutSummary)
      : null;

  const bomResult = reconstructBomResult(est, bom, roomList);
  const rfqConfig = {
    companyName: profileData?.company_name ?? "",
    companyPhone: profileData?.company_phone ?? "",
    companyEmail: profileData?.company_email ?? "",
    supplierName: est.supplier_name,
    projectName: est.project_name,
    customerName: est.customer_name,
  };

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
            {est.accepted_at && (
              <span className="text-sm text-txt-secondary">
                Accepted on{" "}
                {new Date(est.accepted_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
            {est.declined_at && (
              <span className="text-sm text-txt-secondary">
                Declined on{" "}
                {new Date(est.declined_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
          <p className="text-sm text-txt-secondary mt-1">{est.customer_name}</p>
          {est.total_sqft != null && (
            <p className="text-sm text-txt-secondary">
              {est.total_sqft.toLocaleString()} sq ft
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ShareBlock estimate={est} activeShare={activeShare} hasUnpricedItems={hasUnpricedItems} />
          <DeleteEstimateButton estimateId={est.id} projectName={est.project_name} />
        </div>
      </div>

      {/* Unsaved share banner */}
      <UnsavedShareBanner
        estimate={est}
        hasActiveShare={activeShare !== null}
        hasUnpricedItems={hasUnpricedItems}
      />

      {/* Recovery banner for broken estimates (no rooms saved) */}
      {roomList.length === 0 && bom.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This estimate has no rooms or BOM data. The drawing analysis may not
            have been saved. You can delete this estimate and create a new one.
          </span>
        </div>
      )}

      {/* Customer */}
      <CustomerCard
        estimateId={est.id}
        customer_name={est.customer_name}
        job_address={est.job_address}
        customer_email={est.customer_email}
        customer_phone={est.customer_phone}
      />

      {/* RFQ + Export actions — hidden when BOM is empty;
          EmptyBomCard handles the generate CTA below. */}
      {bom.length > 0 && (
        <EstimateActions
          bom={bomResult}
          rfqConfig={rfqConfig}
          projectName={est.project_name}
          estimateId={est.id}
          extraActions={
            roomList.length > 0 && est.system_type ? (
              <EquipmentPickerDialog
                estimateId={est.id}
                systemType={est.system_type as SystemType}
                initialSelected={(est.selected_equipment ?? {}) as Partial<Record<BomSlot, string>>}
              />
            ) : null
          }
        />
      )}

      {/* Financials — editable margin slider, labor inputs, live totals */}
      <FinancialsCard
        estimateId={est.id}
        initialMargin={est.profit_margin}
        initialLaborRate={est.labor_rate}
        initialLaborHours={est.labor_hours}
        bomItems={bom}
        status={est.status}
      />

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

      {/* Duct Layout Schematic */}
      {floorplanLayout && (
        <FloorplanSchematic
          layout={floorplanLayout}
          totalSqft={condSqft}
          roomCount={roomList.length}
          climateZone={climateZone}
          totalBTU={layoutSummary.designBTU}
        />
      )}

      {/* Empty-state CTA when estimate has rooms but no BOM */}
      {bom.length === 0 && roomList.length > 0 && (
        <EmptyBomCard estimateId={est.id} />
      )}

      {/* BOM Tables grouped by category — editable */}
      {Object.entries(bomByCategory)
        .sort(([a], [b]) => compareBomCategories(a, b))
        .map(([category, items]) => (
          <BomCategoryTable
            key={category}
            estimateId={est.id}
            category={category}
            items={items}
            status={est.status}
          />
        ))}
    </div>
  );
}
