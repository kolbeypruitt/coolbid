import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/gmail/oauth";
import { signOAuthState } from "@/lib/oauth-state";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = signOAuthState({ userId: user.id });
    const authUrl = buildAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Failed to build auth URL:", error);
    return NextResponse.json(
      { error: "OAuth configuration error" },
      { status: 500 }
    );
  }
}
