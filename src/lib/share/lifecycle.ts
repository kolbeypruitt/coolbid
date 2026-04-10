import { generateShareToken } from "./tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type ShareRow = Database["public"]["Tables"]["estimate_shares"]["Row"];

export const MAX_VALIDITY_DAYS = 180;
export const DEFAULT_VALIDITY_DAYS = 30;

/**
 * Compute a valid expiration date for a share link, capped at MAX_VALIDITY_DAYS.
 * Input may be a date string (YYYY-MM-DD) or null.
 */
export function resolveExpiresAt(validUntil: string | null): string {
  const maxExpires = new Date();
  maxExpires.setDate(maxExpires.getDate() + MAX_VALIDITY_DAYS);

  if (!validUntil) {
    const defaultExpires = new Date();
    defaultExpires.setDate(defaultExpires.getDate() + DEFAULT_VALIDITY_DAYS);
    return defaultExpires.toISOString();
  }

  const requested = new Date(`${validUntil}T23:59:59Z`);
  if (Number.isNaN(requested.getTime())) {
    throw new Error(`Invalid valid_until date: ${validUntil}`);
  }

  return (requested > maxExpires ? maxExpires : requested).toISOString();
}

/**
 * Revoke any existing active share for an estimate, then create a fresh one.
 * Returns the new share row.
 */
export async function createOrReplaceShare(
  estimateId: string,
  validUntil: string | null,
): Promise<ShareRow> {
  const supabase = createAdminClient();

  // Revoke any existing active share
  const { error: revokeError } = await supabase
    .from("estimate_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("estimate_id", estimateId)
    .is("revoked_at", null);

  if (revokeError) {
    throw new Error(`Failed to revoke existing share: ${revokeError.message}`);
  }

  // Insert the new active share
  const { data, error } = await supabase
    .from("estimate_shares")
    .insert({
      estimate_id: estimateId,
      token: generateShareToken(),
      expires_at: resolveExpiresAt(validUntil),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create share: ${error?.message ?? "no data"}`);
  }

  return data as ShareRow;
}

/**
 * Revoke the active share for an estimate, if any.
 */
export async function revokeShare(estimateId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("estimate_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("estimate_id", estimateId)
    .is("revoked_at", null);

  if (error) {
    throw new Error(`Failed to revoke share: ${error.message}`);
  }
}

export type ShareLookupResult =
  | { status: "ok"; share: ShareRow }
  | { status: "not_found" }
  | { status: "revoked" }
  | { status: "expired" };

/**
 * Look up a share by token and determine its current state.
 * Also increments view tracking when the share is valid.
 */
export async function lookupShareByToken(
  token: string,
): Promise<ShareLookupResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("estimate_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return { status: "not_found" };
  }

  const share = data as ShareRow;

  if (share.revoked_at) return { status: "revoked" };
  if (new Date(share.expires_at) < new Date()) return { status: "expired" };

  // Track the view — best effort, never block
  try {
    const now = new Date().toISOString();
    await supabase
      .from("estimate_shares")
      .update({
        view_count: share.view_count + 1,
        last_viewed_at: now,
        first_viewed_at: share.first_viewed_at ?? now,
      })
      .eq("id", share.id);
  } catch (err) {
    console.error("share view tracking failed", { shareId: share.id, err });
  }

  return { status: "ok", share };
}
