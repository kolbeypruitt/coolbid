"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SupplierCard } from "@/lib/hvac/starter-kits";

type Props = {
  vendors: SupplierCard[];
  /** Called on continue. First arg is the list of picked vendor slugs. */
  onComplete: (selectedVendorSlugs: string[], customSupplier?: string) => void;
};

export function SupplierSelect({ vendors, onComplete }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherActive, setOtherActive] = useState(false);
  const [customName, setCustomName] = useState("");

  function toggleSupplier(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  function handleContinue() {
    const slugs = Array.from(selected);
    const custom = otherActive && customName.trim() ? customName.trim() : undefined;
    onComplete(slugs, custom);
  }

  const hasSelection = selected.size > 0 || (otherActive && customName.trim().length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Select your suppliers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the supply houses you buy from. You&apos;ll be able to browse
          their product catalogs from your parts database and estimates.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {vendors.map((vendor) => {
          const isSelected = selected.has(vendor.slug);
          return (
            <button
              key={vendor.slug}
              type="button"
              onClick={() => toggleSupplier(vendor.slug)}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "bg-gradient-card border-2 border-b-accent hover-lift"
                  : "bg-gradient-card border-border hover-glow hover-lift cursor-pointer"
              )}
            >
              <span className="text-sm font-semibold text-txt-primary">{vendor.name}</span>
              {vendor.brands.length > 0 && (
                <span className="text-xs text-txt-tertiary">
                  {vendor.brands.join(", ")}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOtherActive(true)}
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            otherActive
              ? "bg-gradient-card border-2 border-b-accent hover-lift"
              : "bg-gradient-card border-border hover-glow hover-lift cursor-pointer"
          )}
        >
          <span className="text-sm font-semibold text-txt-primary">Other</span>
          {otherActive ? (
            <Input
              type="text"
              placeholder="Supplier name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-7 text-xs focus-accent"
            />
          ) : (
            <span className="text-xs text-txt-tertiary">Enter a custom supplier</span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handleContinue} disabled={!hasSelection} className="bg-gradient-brand hover-lift">
          Continue
        </Button>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "link" }), "text-txt-tertiary hover:text-txt-secondary")}
        >
          Skip for now
        </Link>
      </div>
    </div>
  );
}
