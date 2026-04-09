import Link from "next/link";
import { Plus, FileText } from "lucide-react";
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

type EstimateRow = Pick<
  Database["public"]["Tables"]["estimates"]["Row"],
  "id" | "project_name" | "customer_name" | "total_price" | "status"
>;

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count }, { data: recentEstimates }] = await Promise.all([
    supabase.from("estimates").select("*", { count: "exact", head: true }),
    supabase
      .from("estimates")
      .select("id, project_name, customer_name, total_price, status")
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const estimates = (recentEstimates ?? []) as EstimateRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/estimates/new" className={cn(buttonVariants())}>
          <Plus className="h-4 w-4 mr-2" />
          New Estimate
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total Estimates</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{count ?? 0}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Estimates</CardTitle>
        </CardHeader>
        <CardContent>
          {estimates.length > 0 ? (
            <ul className="space-y-3">
              {estimates.map((estimate) => (
                <li key={estimate.id}>
                  <Link
                    href={`/estimates/${estimate.id}`}
                    className="flex items-center justify-between rounded-md p-3 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{estimate.project_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {estimate.customer_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {estimate.total_price != null
                          ? `$${estimate.total_price.toLocaleString()}`
                          : "—"}
                      </span>
                      <Badge variant="outline">{estimate.status}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-4">No estimates yet.</p>
              <Link
                href="/estimates/new"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create your first estimate
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
