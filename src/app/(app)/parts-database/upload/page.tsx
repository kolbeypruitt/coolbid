"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { QuoteUpload } from "@/components/parts-database/quote-upload";
import { QuoteReview } from "@/components/parts-database/quote-review";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Supplier, ParsedQuoteResult } from "@/types/catalog";

type Step = "upload" | "review" | "saved";

export default function QuoteUploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parsedResult, setParsedResult] = useState<ParsedQuoteResult | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");

  useEffect(() => {
    async function fetchSuppliers() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("suppliers")
        .select("*")
        .eq("user_id", user.id)
        .order("name");

      if (data) setSuppliers(data as Supplier[]);
    }

    fetchSuppliers();
  }, []);

  function handleParsed(result: ParsedQuoteResult, sid: string, fname: string) {
    setParsedResult(result);
    setSupplierId(sid);
    setFileName(fname);
    setStep("review");
  }

  function handleSaved() {
    setStep("saved");
  }

  function resetToUpload() {
    setParsedResult(null);
    setSupplierId("");
    setFileName("");
    setStep("upload");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload Quote</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a supplier quote PDF to extract and save pricing to your catalog.
        </p>
      </div>

      {step === "upload" && (
        <QuoteUpload suppliers={suppliers} onParsed={handleParsed} />
      )}

      {step === "review" && parsedResult && (
        <QuoteReview
          parsedResult={parsedResult}
          supplierId={supplierId}
          fileName={fileName}
          onSave={handleSaved}
          onCancel={resetToUpload}
        />
      )}

      {step === "saved" && (
        <div className="flex flex-col items-center gap-6 rounded-xl border bg-muted/30 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Quote Saved!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Line items have been added to your equipment catalog.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={resetToUpload}>
              Upload Another
            </Button>
            <Button onClick={() => router.push("/parts-database")}>
              View Catalog
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
