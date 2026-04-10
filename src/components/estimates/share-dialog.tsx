"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, CircleX, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ShareDialogProps {
  estimateId: string;
  initial: {
    display_mode: "total_only" | "itemized";
    valid_until: string | null;
    scope_of_work: string | null;
    note_to_customer: string | null;
    customer_email: string | null;
  };
  hasUnpricedItems?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({
  estimateId,
  initial,
  hasUnpricedItems = false,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ url: string; expires_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const defaultValidUntil =
    initial.valid_until ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().slice(0, 10);
    })();

  const [form, setForm] = useState({
    display_mode: initial.display_mode,
    valid_until: defaultValidUntil,
    scope_of_work: initial.scope_of_work ?? "",
    note_to_customer: initial.note_to_customer ?? "",
    customer_email: initial.customer_email ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/estimates/${estimateId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_mode: form.display_mode,
        valid_until: form.valid_until || null,
        scope_of_work: form.scope_of_work.trim() || null,
        note_to_customer: form.note_to_customer.trim() || null,
        customer_email: form.customer_email.trim() || null,
      }),
    });

    setSubmitting(false);

    const json = (await res.json()) as
      | { url: string; expires_at: string }
      | { error: string };

    if (!res.ok || "error" in json) {
      setError("error" in json ? json.error : "Failed to generate link");
      return;
    }

    setResult({ url: json.url, expires_at: json.expires_at });
    router.refresh();
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke() {
    setSubmitting(true);
    await fetch(`/api/estimates/${estimateId}/share`, { method: "DELETE" });
    setSubmitting(false);
    setResult(null);
    router.refresh();
    onOpenChange(false);
  }

  function handleClose() {
    setResult(null);
    setError(null);
    onOpenChange(false);
  }

  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link ready</DialogTitle>
            <DialogDescription>
              Copy this link and send it to {initial.customer_email || "the homeowner"}.
              The link expires {new Date(result.expires_at).toLocaleDateString()}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input readOnly value={result.url} className="font-mono text-xs" />
            <Button type="button" size="sm" onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleRevoke}
              disabled={submitting}
            >
              <CircleX className="mr-2 h-4 w-4" />
              Revoke link
            </Button>
            <div className="flex gap-2">
              <a
                href={`/api/estimates/${estimateId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="button" variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </a>
              <Button
                type="button"
                onClick={handleClose}
                className="bg-gradient-brand hover-lift"
              >
                Done
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share with the homeowner</DialogTitle>
          <DialogDescription>
            Generates a link you can text or email. You can revoke it anytime.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Display mode</Label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm text-txt-secondary">
                <input
                  type="radio"
                  name="display_mode"
                  value="total_only"
                  checked={form.display_mode === "total_only"}
                  onChange={() => setForm({ ...form, display_mode: "total_only" })}
                />
                Total only
              </label>
              <label className="flex items-center gap-2 text-sm text-txt-secondary">
                <input
                  type="radio"
                  name="display_mode"
                  value="itemized"
                  checked={form.display_mode === "itemized"}
                  onChange={() => setForm({ ...form, display_mode: "itemized" })}
                />
                Itemized
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sd_valid_until">Valid until</Label>
            <Input
              id="sd_valid_until"
              type="date"
              value={form.valid_until}
              onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sd_scope">Scope of work</Label>
            <Textarea
              id="sd_scope"
              rows={3}
              value={form.scope_of_work}
              onChange={(e) =>
                setForm({ ...form, scope_of_work: e.target.value })
              }
              placeholder="Auto-generated if left blank"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sd_note">Message to customer (optional)</Label>
            <Textarea
              id="sd_note"
              rows={2}
              value={form.note_to_customer}
              onChange={(e) =>
                setForm({ ...form, note_to_customer: e.target.value })
              }
              placeholder="Thanks for having me out Tuesday..."
            />
          </div>

          {hasUnpricedItems && (
            <div className="flex items-start gap-3 rounded-md border border-error bg-error-bg p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
              <div className="text-sm text-error">
                <p className="font-medium">Some items don&apos;t have pricing yet.</p>
                <p className="mt-1 text-txt-secondary">
                  Send an RFQ to your supplier first so the quote reflects real costs.
                  Sharing now would understate the total.
                </p>
              </div>
            </div>
          )}

          {!initial.customer_email && (
            <div className="space-y-2 rounded-md border border-warning bg-[rgba(251,191,36,0.08)] p-3">
              <p className="text-sm text-warning">
                No customer email on file. Add one so you have it for your records.
              </p>
              <Input
                type="email"
                value={form.customer_email}
                onChange={(e) =>
                  setForm({ ...form, customer_email: e.target.value })
                }
                placeholder="jane@example.com"
              />
            </div>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || hasUnpricedItems}
              className="bg-gradient-brand hover-lift"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate share link"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
