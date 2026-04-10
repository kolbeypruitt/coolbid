"use client";

import { useState } from "react";
import { AlertTriangle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "./share-dialog";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];

export interface UnsavedShareBannerProps {
  estimate: EstimateRow;
  hasActiveShare: boolean;
  hasUnpricedItems: boolean;
}

export function UnsavedShareBanner({
  estimate,
  hasActiveShare,
  hasUnpricedItems,
}: UnsavedShareBannerProps) {
  const [shareOpen, setShareOpen] = useState(false);

  // Only show when estimate is draft but has an active (stale) share link
  if (estimate.status !== "draft" || !hasActiveShare) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-warning bg-warning-bg px-4 py-3 text-sm text-warning">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            You&apos;ve made changes since this estimate was last shared. The
            homeowner still sees the old version.
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => setShareOpen(true)}
          className="shrink-0 bg-gradient-brand hover-lift"
        >
          <Share2 className="mr-1 h-3.5 w-3.5" />
          Re-share
        </Button>
      </div>

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
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </>
  );
}
