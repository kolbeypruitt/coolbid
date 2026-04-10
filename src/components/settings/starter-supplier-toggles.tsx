"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { Database } from "@/types/database";

type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"];

export function StarterSupplierToggles() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("suppliers")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_starter", true)
        .order("name");

      setSuppliers(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function handleToggle(supplier: SupplierRow) {
    const newValue = !supplier.is_active;

    // Optimistic update
    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplier.id ? { ...s, is_active: newValue } : s))
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("suppliers")
      .update({ is_active: newValue })
      .eq("id", supplier.id);

    if (error) {
      // Rollback
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === supplier.id ? { ...s, is_active: !newValue } : s
        )
      );
    }
  }

  if (loading || suppliers.length === 0) return null;

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <CardTitle className="text-txt-primary">Starter Parts Lists</CardTitle>
        <CardDescription className="text-txt-secondary">
          Toggle off a supplier to hide their starter equipment from your catalog
          and estimates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {suppliers.map((supplier) => (
          <label
            key={supplier.id}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3 cursor-pointer hover:bg-[rgba(6,182,212,0.03)] transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-txt-primary">
                {supplier.name}
              </p>
              {supplier.brands.length > 0 && (
                <p className="text-xs text-txt-tertiary">
                  {supplier.brands.join(", ")}
                </p>
              )}
            </div>
            <input
              type="checkbox"
              checked={supplier.is_active}
              onChange={() => handleToggle(supplier)}
              className="rounded border-border"
            />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
