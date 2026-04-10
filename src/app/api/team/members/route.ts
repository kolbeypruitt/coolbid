import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (!profile?.team_id) {
    return NextResponse.json({ members: [] });
  }

  // Verify user is team owner
  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", profile.team_id)
    .eq("owner_id", user.id)
    .single();

  if (!team) {
    return NextResponse.json({ error: "Not a team owner" }, { status: 403 });
  }

  const { data: members } = await supabase
    .from("team_members")
    .select("id, email, role, status, invited_at, accepted_at")
    .eq("team_id", profile.team_id)
    .in("status", ["pending", "active"])
    .order("invited_at", { ascending: false });

  return NextResponse.json({ members: members ?? [] });
}

const deleteSchema = z.object({
  memberId: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
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

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Verify the member belongs to a team the user owns
  const { data: member } = await supabase
    .from("team_members")
    .select("id, team_id, user_id")
    .eq("id", parsed.data.memberId)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", member.team_id)
    .eq("owner_id", user.id)
    .single();

  if (!team) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Remove member
  const { error: removeError } = await supabase
    .from("team_members")
    .update({ status: "removed" })
    .eq("id", parsed.data.memberId);

  if (removeError) {
    console.error("Failed to remove team member:", removeError);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }

  // Clear team_id from member's profile if they had accepted
  if (member.user_id) {
    await supabase
      .from("profiles")
      .update({ team_id: null })
      .eq("id", member.user_id);
  }

  return NextResponse.json({ removed: true });
}
