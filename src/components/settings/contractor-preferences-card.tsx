"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import {
  emptyContractorPreferences,
  type ContractorPreferences,
} from "@/types/contractor-preferences";

export function ContractorPreferencesCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialValue, setInitialValue] = useState<ContractorPreferences>(
    emptyContractorPreferences(),
  );
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("contractor_preferences")
        .eq("id", user.id)
        .single();

      if (!cancelled) {
        setInitialValue(
          (data?.contractor_preferences as ContractorPreferences | null) ??
            emptyContractorPreferences(),
        );
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(prefs: ContractorPreferences) {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage({ type: "error", text: "Not signed in." });
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ contractor_preferences: prefs })
      .eq("id", user.id);

    if (error) {
      setMessage({ type: "error", text: "Failed to save preferences." });
    } else {
      setMessage({ type: "success", text: "Preferences saved." });
      setInitialValue(prefs);
    }
    setSaving(false);
  }

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <CardTitle className="text-txt-primary">Parts selection preferences</CardTitle>
        <CardDescription className="text-txt-secondary">
          Tell Coolbid how you like to build jobs. These preferences are passed as context to the parts-list AI so the generated BOM reflects how you actually run your business.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <PreferencesForm
              initialValue={initialValue}
              onSave={handleSave}
              submitLabel={saving ? "Saving…" : "Save preferences"}
              saving={saving}
            />
            {message ? (
              <p
                className={
                  message.type === "success"
                    ? "mt-4 text-sm text-success"
                    : "mt-4 text-sm text-error"
                }
              >
                {message.text}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
