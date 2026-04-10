import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOrReplaceShare, revokeShare } from "@/lib/share/lifecycle";
import { generateScopeOfWork } from "@/lib/share/scope-of-work";
import type { Database } from "@/types/database";

type EstimateUpdate =
  Database["public"]["Tables"]["estimates"]["Update"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    display_mode?: "total_only" | "itemized";
    valid_until?: string | null;
    note_to_customer?: string | null;
    scope_of_work?: string | null;
    customer_email?: string | null;
  };

  // Load the estimate (RLS ensures ownership)
  const { data: estimate } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .single();

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  // Load BOM for scope-of-work fallback generation
  const { data: bomData } = await supabase
    .from("estimate_bom_items")
    .select("*")
    .eq("estimate_id", id);

  const bom = bomData ?? [];

  // Resolve scope_of_work: contractor-edited > estimate-saved > auto-generated
  const scopeOfWork =
    body.scope_of_work?.trim() ||
    estimate.scope_of_work?.trim() ||
    generateScopeOfWork(estimate, bom);

  // Update the estimate with share-time settings
  const updates: EstimateUpdate = {
    scope_of_work: scopeOfWork,
    status: "sent",
  };
  if (body.display_mode) updates.display_mode = body.display_mode;
  if (body.valid_until !== undefined) updates.valid_until = body.valid_until;
  if (body.note_to_customer !== undefined)
    updates.note_to_customer = body.note_to_customer?.trim() || null;
  if (body.customer_email !== undefined)
    updates.customer_email = body.customer_email?.trim() || null;

  const { error: updateError } = await supabase
    .from("estimates")
    .update(updates)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update estimate: ${updateError.message}` },
      { status: 500 },
    );
  }

  // Create the share row
  const share = await createOrReplaceShare(id, body.valid_until ?? null);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://coolbid.app";

  return NextResponse.json({
    token: share.token,
    url: `${appUrl}/q/${share.token}`,
    expires_at: share.expires_at,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership via RLS-enabled read
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id")
    .eq("id", id)
    .single();

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  await revokeShare(id);
  return NextResponse.json({ success: true });
}
