import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/gmail/oauth";

const requestSchema = z.object({
  connection_id: z.string().uuid(),
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
      { error: "Invalid request" },
      { status: 400 }
    );
  }

  const { data: connection, error: fetchError } = await supabase
    .from("email_connections")
    .select("*")
    .eq("id", parsed.data.connection_id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    await revokeToken(connection.refresh_token);
  } catch (err) {
    console.error("Failed to revoke token:", err);
  }

  const { error: deleteError } = await supabase
    .from("email_connections")
    .delete()
    .eq("id", connection.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
