"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STARTER_SUPPLIERS, UNIVERSAL_STARTER_ITEMS } from "@/lib/hvac/starter-kits";
import type { StarterEquipment } from "@/lib/hvac/starter-kits";
import { SupplierSelect } from "@/components/onboarding/supplier-select";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import {
  emptyContractorPreferences,
  type ContractorPreferences,
} from "@/types/contractor-preferences";

function toEquipmentRow(
  item: StarterEquipment,
  userId: string,
  supplierId: string | null
) {
  return {
    user_id: userId,
    supplier_id: supplierId,
    model_number: item.model_number,
    description: item.description,
    equipment_type: item.equipment_type,
    system_type: item.system_type,
    brand: item.brand,
    tonnage: item.tonnage,
    seer_rating: item.seer_rating,
    btu_capacity: item.btu_capacity,
    stages: null,
    refrigerant_type: null,
    unit_price: item.unit_price,
    unit_of_measure: item.unit_of_measure,
    source: "starter" as const,
    usage_count: 0,
    last_quoted_date: null,
  };
}

type Step = "suppliers" | "preferences";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("suppliers");

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

      setLoading(false);
    }

    checkOnboarding();
  }, [router]);

  async function handleSuppliersComplete(
    selectedSuppliers: string[],
    customSupplier?: string
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
      await Promise.all(
        selectedSuppliers.map(async (supplierName) => {
          const starterSupplier = STARTER_SUPPLIERS.find((s) => s.name === supplierName);
          if (!starterSupplier) return;

          const { data: supplierRecord, error: supplierError } = await supabase
            .from("suppliers")
            .insert({
              user_id: user.id,
              name: starterSupplier.name,
              brands: starterSupplier.brands,
              is_starter: true,
              contact_email: "",
              contact_phone: "",
            })
            .select("id")
            .single();

          if (supplierError || !supplierRecord) {
            console.error("Failed to insert supplier", supplierName, supplierError);
            return;
          }

          const { error: equipmentError } = await supabase
            .from("equipment_catalog")
            .insert(
              starterSupplier.equipment.map((item) =>
                toEquipmentRow(item, user.id, supplierRecord.id)
              )
            );

          if (equipmentError) {
            console.error("Failed to insert equipment for", supplierName, equipmentError);
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc("seed_starter_supplier_domains", {
            p_user_id: user.id,
            p_supplier_id: supplierRecord.id,
            p_supplier_name: starterSupplier.name,
          });
        })
      );

      const { error: universalError } = await supabase
        .from("equipment_catalog")
        .insert(UNIVERSAL_STARTER_ITEMS.map((item) => toEquipmentRow(item, user.id, null)));

      if (universalError) {
        console.error("Failed to insert universal items", universalError);
      }

      if (customSupplier) {
        const { error: customError } = await supabase.from("suppliers").insert({
          user_id: user.id,
          name: customSupplier,
          brands: [],
          is_starter: false,
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
          <SupplierSelect onComplete={handleSuppliersComplete} />
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
