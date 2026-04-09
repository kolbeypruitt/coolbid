"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { QuoteReview } from "@/components/parts-database/quote-review";
import type {
  ParsedQuoteResult,
  ParsedLineItem,
  EquipmentType,
} from "@/types/catalog";

type LoadedQuote = {
  id: string;
  supplier_id: string | null;
  quote_number: string;
  quote_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  file_name: string;
  supplier: { name: string } | null;
};

export default function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [quote, setQuote] = useState<LoadedQuote | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedQuoteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select("id, supplier_id, quote_number, quote_date, subtotal, tax, total, file_name, supplier:suppliers(name)")
        .eq("id", id)
        .single();

      if (quoteError || !quoteData) {
        setError("Quote not found");
        setLoading(false);
        return;
      }

      const typed = quoteData as unknown as LoadedQuote;

      const { data: lineData, error: lineError } = await supabase
        .from("quote_lines")
        .select("*")
        .eq("quote_id", id)
        .order("created_at", { ascending: true });

      if (lineError) {
        setError("Failed to load line items");
        setLoading(false);
        return;
      }

      const lineItems: ParsedLineItem[] = (lineData ?? []).map((row) => ({
        model_number: row.model_number,
        description: row.description,
        equipment_type: row.equipment_type as EquipmentType,
        brand: row.brand,
        tonnage: row.tonnage,
        seer_rating: row.seer_rating,
        btu_capacity: row.btu_capacity,
        stages: row.stages,
        refrigerant_type: row.refrigerant_type,
        quantity: row.quantity,
        unit_price: row.unit_price,
        extended_price: row.extended_price,
      }));

      setQuote(typed);
      setParsedResult({
        supplier_name: typed.supplier?.name ?? "",
        quote_number: typed.quote_number,
        quote_date: typed.quote_date ?? "",
        subtotal: typed.subtotal,
        tax: typed.tax,
        total: typed.total,
        line_items: lineItems,
      });
      setLoading(false);
    }

    load();
  }, [id]);

  async function handleReject() {
    if (!confirm("Reject this quote? It will be hidden from the review queue.")) return;
    setRejecting(true);
    const supabase = createClient();
    await supabase.from("quotes").update({ status: "rejected" }).eq("id", id);
    router.push("/parts-database/review");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-accent-light" />
      </div>
    );
  }

  if (error || !quote || !parsedResult) {
    return (
      <div className="space-y-4">
        <Link
          href="/parts-database/review"
          className="inline-flex items-center gap-2 text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review queue
        </Link>
        <p className="text-error">{error ?? "Quote not found"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/parts-database/review"
          className="inline-flex items-center gap-2 text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review queue
        </Link>
        <button
          onClick={handleReject}
          disabled={rejecting}
          className="text-sm font-medium text-error hover:underline"
        >
          {rejecting ? "Rejecting..." : "Reject quote"}
        </button>
      </div>

      <QuoteReview
        parsedResult={parsedResult}
        supplierId={quote.supplier_id ?? ""}
        fileName={quote.file_name}
        existingQuoteId={quote.id}
        onSave={() => router.push("/parts-database/review")}
        onCancel={() => router.push("/parts-database/review")}
      />
    </div>
  );
}
