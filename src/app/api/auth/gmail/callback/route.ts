import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { exchangeCodeForTokens, fetchUserEmail } from "@/lib/gmail/oauth";
import { verifyOAuthState } from "@/lib/oauth-state";
import type { Database } from "@/types/database";

function getServiceClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/parts-database?gmail_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=missing_params`);
  }

  const stateResult = verifyOAuthState(state);
  if (!stateResult.valid) {
    return NextResponse.redirect(
      `${appUrl}/parts-database?gmail_error=${encodeURIComponent(stateResult.error)}`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${appUrl}/parts-database?gmail_error=no_refresh_token`
      );
    }

    const emailAddress = await fetchUserEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = getServiceClient();

    // Check for existing connection
    const { data: existing } = await supabase
      .from("email_connections")
      .select("id")
      .eq("user_id", stateResult.userId)
      .eq("email_address", emailAddress)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("email_connections")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          scopes: tokens.scope.split(" "),
          last_sync_at: null,
          last_sync_status: "idle",
          last_sync_error: null,
        })
        .eq("id", existing.id);
    } else {
      const { error: insertError } = await supabase
        .from("email_connections")
        .insert({
          user_id: stateResult.userId,
          provider: "gmail",
          email_address: emailAddress,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          scopes: tokens.scope.split(" "),
        });

      if (insertError) {
        console.error("Failed to save connection:", insertError);
        return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=save_failed`);
      }
    }

    return NextResponse.redirect(`${appUrl}/parts-database?gmail_connected=true`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=callback_failed`);
  }
}
