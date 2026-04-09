"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SubscriptionStatus } from "@/components/billing/subscription-status";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const [form, setForm] = useState({
    company_name: "",
    company_email: "",
    company_phone: "",
    address: "",
    state: "",
    zip: "",
  });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data as ProfileRow);
        setForm({
          company_name: data.company_name ?? "",
          company_email: data.company_email ?? "",
          company_phone: data.company_phone ?? "",
          address: data.address ?? "",
          state: data.state ?? "",
          zip: data.zip ?? "",
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        company_name: form.company_name.trim() || "",
        company_email: form.company_email.trim() || "",
        company_phone: form.company_phone.trim() || "",
        address: form.address.trim() || "",
        state: form.state.trim() || "",
        zip: form.zip.trim() || "",
      })
      .eq("id", profile.id);

    if (error) {
      setMessage({ type: "error", text: "Failed to save changes. Please try again." });
    } else {
      setMessage({ type: "success", text: "Settings saved successfully." });
    }
    setSaving(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-txt-primary">Settings</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-txt-primary">Settings</h1>

      {/* Profile form */}
      <Card className="bg-gradient-card border-border">
        <CardHeader>
          <CardTitle className="text-txt-primary">Company Profile</CardTitle>
          <CardDescription className="text-txt-secondary">Update your company information.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                name="company_name"
                value={form.company_name}
                onChange={handleChange}
                placeholder="Acme HVAC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_email">Email</Label>
              <Input
                id="company_email"
                name="company_email"
                type="email"
                value={form.company_email}
                onChange={handleChange}
                placeholder="contact@acmehvac.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_phone">Phone</Label>
              <Input
                id="company_phone"
                name="company_phone"
                type="tel"
                value={form.company_phone}
                onChange={handleChange}
                placeholder="(555) 000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  placeholder="TX"
                  maxLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input
                  id="zip"
                  name="zip"
                  value={form.zip}
                  onChange={handleChange}
                  placeholder="75001"
                />
              </div>
            </div>

            {message && (
              <p
                className={
                  message.type === "success"
                    ? "text-sm text-success"
                    : "text-sm text-error"
                }
              >
                {message.text}
              </p>
            )}

            <Button type="submit" disabled={saving} className="bg-gradient-brand hover-lift">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Subscription */}
      <SubscriptionStatus />
    </div>
  );
}
