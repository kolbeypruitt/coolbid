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

    const alreadyConnectedUrl = `${appUrl}/parts-database?gmail_error=${encodeURIComponent(
      "This email is already connected to another account"
    )}`;

    // Reject if this email is already connected to a different user
    const { data: otherUser, error: dupCheckError } = await supabase
      .from("email_connections")
      .select("id")
      .eq("provider", "gmail")
      .eq("email_address", emailAddress)
      .neq("user_id", stateResult.userId)
      .maybeSingle();

    if (dupCheckError) {
      console.error("Duplicate-user check failed:", dupCheckError);
      return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=connection_check_failed`);
    }

    if (otherUser) {
      return NextResponse.redirect(alreadyConnectedUrl);
    }

    // Check for existing connection by this user
    const { data: existing, error: existingCheckError } = await supabase
      .from("email_connections")
      .select("id")
      .eq("user_id", stateResult.userId)
      .eq("email_address", emailAddress)
      .maybeSingle();

    if (existingCheckError) {
      console.error("Existing connection check failed:", existingCheckError);
      return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=connection_check_failed`);
    }

    if (existing) {
      const { error: updateError } = await supabase
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

      if (updateError) {
        console.error("Failed to update connection:", updateError);
        return NextResponse.redirect(`${appUrl}/parts-database?gmail_error=save_failed`);
      }
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
        if (insertError.code === "23505") {
          return NextResponse.redirect(alreadyConnectedUrl);
        }
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
