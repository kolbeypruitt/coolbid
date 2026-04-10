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
import { cn } from "@/lib/utils";
type RecentEstimate = {
  id: string;
  project_name: string;
  customer_name: string;
  total_price: number | null;
  status: "draft" | "sent" | "accepted" | "declined";
  estimate_shares: Array<{
    view_count: number;
    last_viewed_at: string | null;
    revoked_at: string | null;
  }> | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count }, { data: recentEstimates }] = await Promise.all([
    supabase.from("estimates").select("*", { count: "exact", head: true }),
    supabase
      .from("estimates")
      .select(
        `id, project_name, customer_name, total_price, status,
         estimate_shares ( view_count, last_viewed_at, revoked_at )`,
      )
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const estimates = (recentEstimates ?? []) as unknown as RecentEstimate[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-txt-primary">Dashboard</h1>
        <Link href="/estimates/new" className={cn(buttonVariants(), "bg-gradient-brand hover-lift")}>
          <Plus className="h-4 w-4 mr-2" />
          New Estimate
        </Link>
      </div>

      <Card className="bg-gradient-card border-border">
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wider text-txt-tertiary">Total Estimates</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-gradient-brand">{count ?? 0}</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-card border-border">
        <CardHeader>
          <CardTitle className="text-txt-primary">Recent Estimates</CardTitle>
        </CardHeader>
        <CardContent>
          {estimates.length > 0 ? (
            <ul className="space-y-3">
              {estimates.map((estimate) => {
                const activeShare = (estimate.estimate_shares ?? []).find(
                  (s) => s.revoked_at === null,
                );
                const viewCount = activeShare?.view_count ?? 0;

                return (
                  <li key={estimate.id}>
                    <Link
                      href={`/estimates/${estimate.id}`}
                      className="flex items-center justify-between rounded-md border border-border p-3 transition-colors hover:bg-bg-card-hover"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-txt-primary font-medium">{estimate.project_name}</p>
                          <p className="text-txt-secondary text-sm">{estimate.customer_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-txt-primary font-medium">
                          {estimate.total_price != null
                            ? `$${estimate.total_price.toLocaleString()}`
                            : "—"}
                        </span>
                        {viewCount > 0 && (
                          <span className="rounded-full bg-[rgba(6,182,212,0.1)] px-2 py-0.5 text-xs text-accent-light">
                            {viewCount} view{viewCount === 1 ? "" : "s"}
                          </span>
                        )}
                        <span className="text-txt-tertiary text-xs capitalize">{estimate.status}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-center py-8">
              <p className="mb-4 text-txt-secondary">No estimates yet.</p>
              <Link
                href="/estimates/new"
                className={cn("text-accent-light")}
              >
                <Plus className="h-4 w-4 mr-2 inline" />
                Create your first estimate
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
