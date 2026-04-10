"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];

export type RespondResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "already_responded" };

export async function respondToEstimate(
  token: string,
  decision: "accepted" | "declined",
): Promise<RespondResult> {
  const supabase = createAdminClient();

  const { data: share, error: shareError } = await supabase
    .from("estimate_shares")
    .select("id, estimate_id, revoked_at, expires_at, responded_at")
    .eq("token", token)
    .maybeSingle();

  if (shareError || !share) {
    return { ok: false, reason: "not_found" };
  }

  if (share.revoked_at) return { ok: false, reason: "expired" };
  if (new Date(share.expires_at) < new Date()) return { ok: false, reason: "expired" };
  if (share.responded_at) return { ok: false, reason: "already_responded" };

  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("id", share.estimate_id)
    .single();

  if (!estimate) return { ok: false, reason: "not_found" };

  const est = estimate as Pick<EstimateRow, "id" | "status">;
  if (est.status !== "sent") return { ok: false, reason: "already_responded" };

  const now = new Date().toISOString();

  const updatePayload =
    decision === "accepted"
      ? { status: decision, accepted_at: now }
      : { status: decision, declined_at: now };

  const { error: updateError } = await supabase
    .from("estimates")
    .update(updatePayload)
    .eq("id", est.id);

  if (updateError) {
    throw new Error(`Failed to update estimate: ${updateError.message}`);
  }

  const { error: shareUpdateError } = await supabase
    .from("estimate_shares")
    .update({ responded_at: now })
    .eq("id", share.id);

  if (shareUpdateError) {
    console.error("Failed to mark share as responded", { shareId: share.id, error: shareUpdateError.message });
  }

  return { ok: true };
}
