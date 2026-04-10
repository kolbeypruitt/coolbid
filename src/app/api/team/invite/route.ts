import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canUseFeature, PRO_TEAM_SEAT_LIMIT } from "@/types/billing";
import type { SubscriptionTier } from "@/types/billing";

const requestSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email address", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, team_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const tier = (profile.subscription_tier ?? "trial") as SubscriptionTier;
  if (!canUseFeature(tier, "team_invites")) {
    return NextResponse.json(
      { error: "Team invites require a Pro or Enterprise plan." },
      { status: 403 }
    );
  }

  // Get or create team
  let teamId = profile.team_id;
  if (!teamId) {
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({ owner_id: user.id, name: "My Team" })
      .select("id")
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
    }
    teamId = team.id;

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ team_id: teamId })
      .eq("id", user.id);

    if (profileUpdateError) {
      console.error("Failed to link team to profile:", profileUpdateError);
      return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
    }
  }

  // Check seat limit for Pro
  if (tier === "pro") {
    const { count } = await supabase
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .in("status", ["pending", "active"]);

    // +1 for the owner
    if ((count ?? 0) + 1 >= PRO_TEAM_SEAT_LIMIT) {
      return NextResponse.json(
        { error: `Pro plan supports up to ${PRO_TEAM_SEAT_LIMIT} team members. Upgrade to Enterprise for unlimited seats.` },
        { status: 403 }
      );
    }
  }

  // Create invite
  const { data: invite, error: inviteError } = await supabase
    .from("team_members")
    .insert({
      team_id: teamId,
      email: parsed.data.email.trim().toLowerCase(),
      role: "member",
      status: "pending",
    })
    .select("id, email")
    .single();

  if (inviteError) {
    if (inviteError.code === "23505") {
      return NextResponse.json(
        { error: "This email has already been invited." },
        { status: 409 }
      );
    }
    console.error("Failed to create invite:", inviteError);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }

  // Email sending will be wired up in Task 19

  return NextResponse.json({ invite });
}
