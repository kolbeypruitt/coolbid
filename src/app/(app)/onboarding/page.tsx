"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SupplierCard } from "@/lib/hvac/starter-kits";
import { SupplierSelect } from "@/components/onboarding/supplier-select";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState<SupplierCard[]>([]);

  useEffect(() => {
    async function checkOnboarding() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();

      if (profile?.onboarding_completed) {
        router.replace("/dashboard");
        return;
      }

      const { data: vendorRows } = await supabase
        .from("vendors")
        .select("id, slug, name")
        .eq("is_active", true)
        .order("name");

      setVendors(
        (vendorRows ?? []).map((v) => ({
          slug: v.slug,
          name: v.name,
          // Brand lists are derived at display time from vendor_products
          // if we ever need them; onboarding just needs the name.
          brands: [],
        })),
      );

      setLoading(false);
    }

    checkOnboarding();
  }, [router]);

  async function handleComplete(
    selectedSlugs: string[],
    customSupplier?: string,
  ) {
    setSaving(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    try {
      // Re-fetch vendors so we have the ids (the page state has them
      // but we re-read defensively in case the picker was deep-linked).
      const { data: vendorRows } = await supabase
        .from("vendors")
        .select("id, slug, name")
        .in("slug", selectedSlugs);

      if (vendorRows && vendorRows.length > 0) {
        const supplierInserts = vendorRows.map((v) => ({
          user_id: user.id,
          name: v.name,
          brands: [] as string[],
          is_starter: false,
          vendor_id: v.id,
          contact_email: "",
          contact_phone: "",
        }));

        const { error: supplierError } = await supabase
          .from("suppliers")
          .insert(supplierInserts);

        if (supplierError) {
          console.error("Failed to insert suppliers", supplierError);
        }

        // Seed known email domains for each picked supplier (best-effort,
        // RPC exists from migration 005).
        for (const v of vendorRows) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .rpc("seed_starter_supplier_domains", {
              p_user_id: user.id,
              p_supplier_id: null,
              p_supplier_name: v.name,
            })
            .then(() => null)
            .catch(() => null);
        }
      }

      if (customSupplier) {
        const { error: customError } = await supabase.from("suppliers").insert({
          user_id: user.id,
          name: customSupplier,
          brands: [],
          is_starter: false,
          vendor_id: null,
          contact_email: "",
          contact_phone: "",
        });

        if (customError) {
          console.error("Failed to insert custom supplier", customError);
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("profiles") as any)
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      document.cookie =
        "onboarding_done=true; path=/; max-age=31536000; SameSite=Lax";

      router.replace("/dashboard");
    } catch (err) {
      console.error("Onboarding failed unexpectedly", err);
      setSaving(false);
    }
  }

  if (loading || saving) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {saving ? "Saving your suppliers…" : "Loading…"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="mx-auto w-full max-w-2xl">
        <SupplierSelect vendors={vendors} onComplete={handleComplete} />
      </div>
    </div>
  );
}
