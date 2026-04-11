"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2, ArrowLeftRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRoomType } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CatalogSearchDialog } from "./catalog-search-dialog";
import { SourceBadge } from "@/components/ui/source-badge";
import { AddPartDialog } from "./add-part-dialog";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];
type CatalogRow = Database["public"]["Tables"]["equipment_catalog"]["Row"];

export interface BomCategoryTableProps {
  estimateId: string;
  category: string;
  items: BomRow[];
  status: string;
}

export function BomCategoryTable({
  estimateId,
  category,
  items,
  status,
}: BomCategoryTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editCost, setEditCost] = useState(0);
  const [swapItemId, setSwapItemId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function flipToDraftIfSent() {
    if (status !== "sent") return;
    const supabase = createClient();
    await supabase
      .from("estimates")
      .update({ status: "draft" })
      .eq("id", estimateId)
      .eq("status", "sent");
  }

  function startEdit(item: BomRow) {
    setEditingId(item.id);
    setEditQty(item.quantity);
    setEditCost(item.unit_cost);
  }

  async function saveEdit(itemId: string) {
    const supabase = createClient();
    const totalCost = editQty * editCost;
    const { error } = await supabase
      .from("estimate_bom_items")
      .update({
        quantity: editQty,
        unit_cost: editCost,
        total_cost: totalCost,
        source: "manual",
      })
      .eq("id", itemId);

    if (error) return;
    await flipToDraftIfSent();
    setEditingId(null);
    router.refresh();
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Delete this item?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("estimate_bom_items")
      .delete()
      .eq("id", itemId);

    if (error) return;
    await flipToDraftIfSent();
    router.refresh();
  }

  async function handleSwap(catalogItem: CatalogRow) {
    if (!swapItemId) return;
    const supabase = createClient();
    const currentItem = items.find((i) => i.id === swapItemId);
    const qty = currentItem?.quantity ?? 1;
    const unitCost = catalogItem.unit_price ?? 0;

    const { error } = await supabase
      .from("estimate_bom_items")
      .update({
        description: catalogItem.description,
        unit_cost: unitCost,
        total_cost: unitCost * qty,
        part_id: catalogItem.id,
        supplier: catalogItem.brand || null,
        sku: catalogItem.model_number || null,
        source: "starter",
      })
      .eq("id", swapItemId);

    if (error) return;
    await flipToDraftIfSent();
    setSwapItemId(null);
    router.refresh();
  }

  return (
    <>
      <Card className="bg-gradient-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-txt-primary">
            {formatRoomType(category)}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAddOpen(true)}
            className="text-txt-secondary hover:text-txt-primary"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">
                  Description
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3">
                  SKU
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">
                  Qty
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">
                  Unit Cost
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 text-right">
                  Total
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary pb-3 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <TableRow
                    key={item.id}
                    className="border-b border-border hover:bg-[rgba(6,182,212,0.03)] transition-colors"
                  >
                    <TableCell className="text-sm text-txt-primary font-medium py-2">
                      <div className="flex items-center gap-2">
                        {item.description}
                        <SourceBadge source={item.source} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-txt-secondary py-2">
                      {item.sku ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-right py-2">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={1}
                          value={editQty}
                          onChange={(e) =>
                            setEditQty(parseInt(e.target.value) || 1)
                          }
                          className="w-16 text-right ml-auto"
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveEdit(item.id)
                          }
                        />
                      ) : (
                        <span className="tabular-nums text-txt-primary font-medium">
                          {item.quantity} {item.unit}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-right py-2">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editCost}
                          onChange={(e) =>
                            setEditCost(parseFloat(e.target.value) || 0)
                          }
                          className="w-24 text-right ml-auto"
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveEdit(item.id)
                          }
                        />
                      ) : (
                        <span className="tabular-nums text-txt-primary font-medium">
                          ${item.unit_cost.toFixed(2)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-txt-primary font-medium text-right py-2">
                      ${item.total_cost.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => saveEdit(item.id)}
                            className="text-xs"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex items-center justify-center rounded-md p-1 text-txt-secondary hover:bg-bg-card-hover hover:text-txt-primary transition-colors outline-none">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEdit(item)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSwapItemId(item.id)}
                            >
                              <ArrowLeftRight className="mr-2 h-4 w-4" />
                              Swap part
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteItem(item.id)}
                              variant="destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Swap dialog */}
      <CatalogSearchDialog
        open={swapItemId !== null}
        onOpenChange={(open) => {
          if (!open) setSwapItemId(null);
        }}
        onSelect={handleSwap}
        title="Swap part"
      />

      {/* Add dialog */}
      <AddPartDialog
        estimateId={estimateId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={router.refresh}
      />
    </>
  );
}
