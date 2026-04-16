"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileQuestion, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { regenerateBom } from "@/lib/estimates/regenerate-bom";

export function EmptyBomCard({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateBom(estimateId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card className="bg-gradient-card border-warning">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-txt-primary">
          <FileQuestion aria-hidden="true" className="h-5 w-5 text-warning" />
          No BOM yet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-txt-secondary">
          This estimate has rooms but no bill of materials. Generate one from
          your parts database and the scraped vendor catalog.
        </p>
        <Button
          onClick={handleGenerate}
          disabled={isPending}
          className="bg-gradient-brand hover-lift"
        >
          <RefreshCw
            aria-hidden="true"
            className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`}
          />
          {isPending ? "Generating…" : "Generate BOM"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
