"use client";

import { useState } from "react";
import { Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "./share-dialog";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ShareRow = Database["public"]["Tables"]["estimate_shares"]["Row"];

export interface ShareBlockProps {
  estimate: EstimateRow;
  activeShare: ShareRow | null;
  hasUnpricedItems?: boolean;
}

export function ShareBlock({ estimate, activeShare, hasUnpricedItems = false }: ShareBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <a
          href={`/api/estimates/${estimate.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </a>
        <Button
          onClick={() => setOpen(true)}
          className="bg-gradient-brand hover-lift"
        >
          <Share2 className="mr-2 h-4 w-4" />
          {activeShare ? "Manage share link" : "Share with homeowner"}
        </Button>
      </div>

      {activeShare && (
        <p className="mt-2 text-right text-xs text-txt-tertiary">
          Active link · {activeShare.view_count} view
          {activeShare.view_count === 1 ? "" : "s"}
          {activeShare.last_viewed_at
            ? ` · last viewed ${new Date(activeShare.last_viewed_at).toLocaleDateString()}`
            : ""}
        </p>
      )}

      <ShareDialog
        estimateId={estimate.id}
        initial={{
          display_mode: estimate.display_mode,
          valid_until: estimate.valid_until,
          scope_of_work: estimate.scope_of_work,
          note_to_customer: estimate.note_to_customer,
          customer_email: estimate.customer_email,
        }}
        hasUnpricedItems={hasUnpricedItems}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
