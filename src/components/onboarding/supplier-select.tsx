"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SupplierCard = {
  name: string;
  brands: string[];
};

const STARTER_SUPPLIER_CARDS: SupplierCard[] = [
  { name: "Johnstone Supply", brands: ["Goodman", "Daikin"] },
  { name: "Sanders Supply", brands: ["Carrier", "Bryant", "Tempstar"] },
  { name: "Shearer Supply", brands: ["Lennox"] },
  { name: "Locke Supply", brands: ["Goodman", "Rheem", "Ruud"] },
  { name: "Amsco Supply", brands: ["Rheem", "Ruud", "York"] },
];

type Props = {
  onComplete: (selectedSuppliers: string[], customSupplier?: string) => void;
};

export function SupplierSelect({ onComplete }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherActive, setOtherActive] = useState(false);
  const [customName, setCustomName] = useState("");

  function toggleSupplier(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function handleContinue() {
    const suppliers = Array.from(selected);
    const custom = otherActive && customName.trim() ? customName.trim() : undefined;
    onComplete(suppliers, custom);
  }

  const hasSelection = selected.size > 0 || (otherActive && customName.trim().length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Select your suppliers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the suppliers you buy from. We'll pre-load their equipment into your catalog.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {STARTER_SUPPLIER_CARDS.map((supplier) => {
          const isSelected = selected.has(supplier.name);
          return (
            <button
              key={supplier.name}
              type="button"
              onClick={() => toggleSupplier(supplier.name)}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <span className="text-sm font-medium">{supplier.name}</span>
              <span className="text-xs text-muted-foreground">
                {supplier.brands.join(", ")}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOtherActive(true)}
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            otherActive
              ? "border-primary bg-primary/5"
              : "border-border bg-card hover:bg-muted/50"
          )}
        >
          <span className="text-sm font-medium">Other</span>
          {otherActive ? (
            <Input
              type="text"
              placeholder="Supplier name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-7 text-xs"
            />
          ) : (
            <span className="text-xs text-muted-foreground">Enter a custom supplier</span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handleContinue} disabled={!hasSelection}>
          Continue
        </Button>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "link" })}
        >
          Skip for now
        </Link>
      </div>
    </div>
  );
}
