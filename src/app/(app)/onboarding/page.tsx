"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SupplierCard } from "@/lib/hvac/starter-kits";
import { SupplierSelect } from "@/components/onboarding/supplier-select";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import {
  emptyContractorPreferences,
  type ContractorPreferences,
} from "@/types/contractor-preferences";

type Step = "suppliers" | "preferences";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("suppliers");
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
          brands: [],
        })),
      );

      setLoading(false);
    }

    checkOnboarding();
  }, [router]);

  async function handleSuppliersComplete(
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

      // Advance to preferences step. Do NOT flip onboarding_completed here —
      // the middleware caches that flag in a 1-year cookie and the user would
      // be unable to return to /onboarding to finish step 2.
      setStep("preferences");
      setSaving(false);
    } catch (err) {
      console.error("Onboarding step 1 failed unexpectedly", err);
      setSaving(false);
    }
  }

  async function handlePreferencesComplete(prefs: ContractorPreferences) {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/auth/login");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("profiles") as any)
      .update({
        contractor_preferences: prefs,
        onboarding_completed: true,
      })
      .eq("id", user.id);

    if (error) {
      console.error("Failed to save preferences at end of onboarding", error);
      setSaving(false);
      return;
    }

    document.cookie = "onboarding_done=true; path=/; max-age=31536000; SameSite=Lax";
    router.replace("/dashboard");
  }

  if (loading || saving) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {saving ? "Setting up your account…" : "Loading…"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="mx-auto w-full max-w-2xl">
        {step === "suppliers" ? (
          <SupplierSelect vendors={vendors} onComplete={handleSuppliersComplete} />
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">How do you like to do jobs?</h1>
              <p className="mt-2 text-muted-foreground">
                These preferences help Coolbid generate parts lists that match how you actually run your business. You can change them later in Settings.
              </p>
            </div>
            <PreferencesForm
              initialValue={emptyContractorPreferences()}
              onSave={handlePreferencesComplete}
              submitLabel="Finish setup"
              saving={saving}
            />
          </div>
        )}
      </div>
    </div>
  );
}
