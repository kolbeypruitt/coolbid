"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STARTER_SUPPLIERS, UNIVERSAL_STARTER_ITEMS } from "@/lib/hvac/starter-kits";
import type { StarterEquipment } from "@/lib/hvac/starter-kits";
import { SupplierSelect } from "@/components/onboarding/supplier-select";

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

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  async function handleComplete(selectedSuppliers: string[], customSupplier?: string) {
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("profiles") as any)
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      document.cookie = "onboarding_done=true; path=/; max-age=31536000; SameSite=Lax";

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
          {saving ? "Setting up your catalog…" : "Loading…"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="mx-auto w-full max-w-2xl">
        <SupplierSelect onComplete={handleComplete} />
      </div>
    </div>
  );
}
