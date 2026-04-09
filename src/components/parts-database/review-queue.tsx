"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type QueueItem = {
  id: string;
  quote_number: string;
  quote_date: string | null;
  source_type: "manual_upload" | "email_attachment" | "email_body";
  source_email_from: string | null;
  source_email_subject: string | null;
  total: number | null;
  created_at: string;
  supplier: { name: string } | null;
  line_count?: number;
};

export function ReviewQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("quotes")
        .select(
          "id, quote_number, quote_date, source_type, source_email_from, source_email_subject, total, created_at, supplier:suppliers(name)"
        )
        .eq("status", "parsed")
        .order("created_at", { ascending: false });

      const typed = (data ?? []) as unknown as QueueItem[];

      // Fetch line counts in parallel
      await Promise.all(
        typed.map(async (item) => {
          const supabase = createClient();
          const { count } = await supabase
            .from("quote_lines")
            .select("*", { count: "exact", head: true })
            .eq("quote_id", item.id);
          item.line_count = count ?? 0;
        })
      );

      setItems(typed);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return <p className="text-txt-secondary">Loading review queue...</p>;
  }

  if (items.length === 0) {
    return (
      <Card className="bg-gradient-card border-border">
        <CardContent className="py-8 text-center">
          <p className="text-txt-secondary">No quotes waiting for review.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Link key={item.id} href={`/parts-database/review/${item.id}`}>
          <Card className="bg-gradient-card border-border hover:border-accent-light hover-lift transition-all cursor-pointer">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                {item.source_type === "manual_upload" ? (
                  <Upload className="h-5 w-5 text-txt-tertiary" />
                ) : (
                  <Mail className="h-5 w-5 text-accent-light" />
                )}
                <div>
                  <div className="font-medium text-txt-primary">
                    {item.supplier?.name ?? "Unknown supplier"}
                    {item.quote_number && ` · ${item.quote_number}`}
                  </div>
                  <div className="text-sm text-txt-secondary">
                    {item.source_email_from && (
                      <span className="mr-3">{item.source_email_from}</span>
                    )}
                    {item.line_count !== undefined && (
                      <span>{item.line_count} line items</span>
                    )}
                  </div>
                  {item.source_email_subject && (
                    <div className="text-xs text-txt-tertiary mt-0.5">
                      {item.source_email_subject}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {item.total != null && (
                  <span className="text-txt-primary font-medium">
                    ${Number(item.total).toLocaleString()}
                  </span>
                )}
                <Badge className="bg-accent-glow text-accent-light border-none">
                  Review
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
