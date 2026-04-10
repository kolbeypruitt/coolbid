"use client";

import { useEffect, useState } from "react";
import { Users, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRO_TEAM_SEAT_LIMIT } from "@/types/billing";
import type { SubscriptionTier } from "@/types/billing";
import type { Database } from "@/types/database";

type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];

interface TeamSectionProps {
  tier: SubscriptionTier;
}

export function TeamSection({ tier }: TeamSectionProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/team/members", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load team members.");
        return r.json();
      })
      .then((data) => {
        setMembers(data.members ?? []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("Failed to load team members.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to send invite.");
        return;
      }

      setMembers((prev) => [
        { id: json.invite.id, team_id: json.invite.team_id, user_id: null, email: json.invite.email, role: "member", status: "pending", invited_at: new Date().toISOString(), accepted_at: null },
        ...prev,
      ]);
      setInviteEmail("");
      setSuccess(`Invite sent to ${json.invite.email}`);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Remove this team member?")) return;

    try {
      const res = await fetch("/api/team/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to remove team member.");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      setError("Failed to remove team member.");
    }
  }

  const seatCount = members.length + 1; // +1 for owner
  const seatLimit = tier === "pro" ? PRO_TEAM_SEAT_LIMIT : null;
  const atLimit = seatLimit !== null && seatCount >= seatLimit;

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-accent-light" />
          <CardTitle className="text-txt-primary">Team</CardTitle>
        </div>
        <CardDescription className="text-txt-secondary">
          Invite team members to create estimates under your account.
          {seatLimit !== null && (
            <span className="ml-1 text-txt-tertiary">
              ({seatCount}/{seatLimit} seats used)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!atLimit && (
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              placeholder="teammate@company.com"
              aria-label="Teammate email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={inviting}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="bg-gradient-brand hover-lift"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              {inviting ? "Sending..." : "Invite"}
            </Button>
          </form>
        )}

        {atLimit && (
          <p className="text-sm text-warning">
            You&apos;ve reached the {seatLimit}-seat limit on Pro. Upgrade to Enterprise for unlimited seats.
          </p>
        )}

        {error && (
          <p className="text-sm text-error">{error}</p>
        )}
        {success && (
          <p className="text-sm text-success">{success}</p>
        )}

        {loading ? (
          <p className="text-sm text-txt-tertiary">Loading...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-txt-tertiary">No team members yet. Invite someone to get started.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-2"
              >
                <div>
                  <span className="text-sm text-txt-primary">{m.email}</span>
                  <Badge
                    variant="outline"
                    className="ml-2 text-xs"
                  >
                    {m.status === "pending" ? "Pending" : "Active"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(m.id)}
                  aria-label={`Remove ${m.email}`}
                  className="text-txt-tertiary hover:text-error"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
