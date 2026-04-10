"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

export interface CustomerDialogProps {
  estimateId: string;
  initial: {
    customer_name: string;
    job_address: string | null;
    customer_email: string | null;
    customer_phone: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerDialog({
  estimateId,
  initial,
  open,
  onOpenChange,
}: CustomerDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: initial.customer_name,
    job_address: initial.job_address ?? "",
    customer_email: initial.customer_email ?? "",
    customer_phone: initial.customer_phone ?? "",
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("estimates")
      .update({
        customer_name: form.customer_name.trim(),
        job_address: form.job_address.trim() || null,
        customer_email: form.customer_email.trim() || null,
        customer_phone: form.customer_phone.trim() || null,
      })
      .eq("id", estimateId);

    setSaving(false);

    if (updateError) {
      setError("Couldn't save — please try again");
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customer details</DialogTitle>
          <DialogDescription>
            These fields appear on the PDF and share page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cd_name">Customer name *</Label>
            <Input
              id="cd_name"
              value={form.customer_name}
              onChange={(e) =>
                setForm({ ...form, customer_name: e.target.value })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cd_address">Job address</Label>
            <Input
              id="cd_address"
              value={form.job_address}
              onChange={(e) =>
                setForm({ ...form, job_address: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cd_email">Email</Label>
              <Input
                id="cd_email"
                type="email"
                value={form.customer_email}
                onChange={(e) =>
                  setForm({ ...form, customer_email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cd_phone">Phone</Label>
              <Input
                id="cd_phone"
                type="tel"
                value={form.customer_phone}
                onChange={(e) =>
                  setForm({ ...form, customer_phone: e.target.value })
                }
              />
            </div>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-brand hover-lift"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
