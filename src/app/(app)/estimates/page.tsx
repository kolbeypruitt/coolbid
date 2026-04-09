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

export default async function EstimatesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("estimates")
    .select(
      "id, project_name, customer_name, total_sqft, total_price, status, updated_at"
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
    | "updated_at"
  >[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Estimates</h1>
        <Link href="/estimates/new" className={cn(buttonVariants())}>
          <Plus className="h-4 w-4 mr-2" />
          New Estimate
        </Link>
      </div>

      {estimates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="mb-4 text-lg">No estimates yet.</p>
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
              <Card className="hover:ring-foreground/20 transition-all cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-base">
                        {estimate.project_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {estimate.customer_name}
                      </p>
                      {estimate.total_sqft != null && (
                        <p className="text-xs text-muted-foreground">
                          {estimate.total_sqft.toLocaleString()} sq ft
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {estimate.total_price != null && (
                        <span className="text-base font-semibold">
                          ${estimate.total_price.toLocaleString()}
                        </span>
                      )}
                      <Badge variant={statusVariant(estimate.status)}>
                        {estimate.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
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
