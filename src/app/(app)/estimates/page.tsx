import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];

function statusVariant(
  status: EstimateRow["status"]
): "outline" | "secondary" | "default" {
  if (status === "draft") return "outline";
  if (status === "sent") return "secondary";
  return "default";
}

function statusClassName(status: EstimateRow["status"]): string {
  if (status === "draft") return "bg-bg-elevated text-txt-tertiary border border-border";
  if (status === "sent") return "bg-accent-glow text-accent-light border-none";
  if (status === "accepted") return "bg-success-bg text-success border-none";
  return "";
}

function statusLabel(status: EstimateRow["status"]): string {
  if (status === "draft") return "Draft";
  if (status === "sent") return "Sent";
  if (status === "accepted") return "Accepted";
  return status;
}

function typeLabel(type: EstimateRow["estimate_type"]): string {
  return type === "changeout" ? "Change-out" : "Full Install";
}

export default async function EstimatesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("estimates")
    .select(
      "id, project_name, customer_name, total_sqft, total_price, status, estimate_type, updated_at"
    )
    .order("updated_at", { ascending: false });

  const estimates = (data ?? []) as Pick<
    EstimateRow,
    | "id"
    | "project_name"
    | "customer_name"
    | "total_sqft"
    | "total_price"
    | "status"
    | "estimate_type"
    | "updated_at"
  >[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-txt-primary">Estimates</h1>
        <Link href="/estimates/new" className={cn(buttonVariants(), "bg-gradient-brand hover-lift")}>
          <Plus className="h-4 w-4 mr-2" />
          New Estimate
        </Link>
      </div>

      {estimates.length === 0 ? (
        <Card className="bg-gradient-card border-border">
          <CardContent className="py-16 text-center">
            <p className="mb-4 text-lg text-txt-secondary">No estimates yet.</p>
            <Link
              href="/estimates/new"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create your first estimate
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {estimates.map((estimate) => (
            <Link
              key={estimate.id}
              href={`/estimates/${estimate.id}`}
              className="block"
            >
              <Card className="bg-gradient-card border-border hover:border-b-accent hover-lift transition-all cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-accent/40 bg-accent-glow/40 text-accent-light"
                        >
                          {typeLabel(estimate.estimate_type)}
                        </Badge>
                        <p className="text-txt-primary font-medium truncate">
                          {estimate.project_name}
                        </p>
                      </div>
                      <p className="text-txt-secondary text-sm truncate">
                        {estimate.customer_name}
                      </p>
                      {estimate.total_sqft != null && (
                        <p className="text-txt-secondary text-sm">
                          {estimate.total_sqft.toLocaleString()} sq ft
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {estimate.total_price != null && (
                        <span className="text-txt-primary font-semibold">
                          ${estimate.total_price.toLocaleString()}
                        </span>
                      )}
                      <Badge
                        variant={statusVariant(estimate.status)}
                        className={statusClassName(estimate.status)}
                      >
                        {statusLabel(estimate.status)}
                      </Badge>
                      <span className="text-txt-tertiary text-xs">
                        {new Date(estimate.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
