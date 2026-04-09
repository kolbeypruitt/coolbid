import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const protectedPaths = ["/dashboard", "/estimates", "/settings", "/onboarding"];
  if (!user && protectedPaths.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Redirect to onboarding if not completed (skip for /onboarding itself and API routes)
  if (user && !path.startsWith("/onboarding") && !path.startsWith("/api") && !path.startsWith("/auth")) {
    const onboardingDone = request.cookies.get("onboarding_done")?.value === "true";
    if (!onboardingDone) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();

      if (profile && !profile.onboarding_completed) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }

      // Profile says done — set cookie so we skip the DB check next time
      if (profile?.onboarding_completed) {
        supabaseResponse.cookies.set("onboarding_done", "true", {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
      }
    }
  }

  // Subscription gating
  const skipGatingPaths = [
    "/pricing",
    "/upgrade",
    "/api",
    "/auth",
    "/onboarding",
    "/_next",
    "/settings",
  ];
  const shouldGate =
    user &&
    !skipGatingPaths.some((p) => path.startsWith(p)) &&
    path !== "/";

  if (shouldGate) {
    const cachedStatus = request.cookies.get("sub_status")?.value;

    if (!cachedStatus) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status, trial_ends_at, ai_actions_used")
        .eq("id", user!.id)
        .single();

      if (profile) {
        const status = profile.subscription_status;
        const trialExpired =
          status === "trialing" && profile.trial_ends_at
            ? new Date(profile.trial_ends_at) < new Date()
            : false;
        const usageExhausted =
          status === "trialing" && profile.ai_actions_used >= 50;

        supabaseResponse.cookies.set("sub_status", status ?? "unknown", {
          path: "/",
          maxAge: 300,
        });

        if (
          status === "canceled" ||
          status === "expired" ||
          (status === "trialing" && trialExpired) ||
          usageExhausted
        ) {
          const url = request.nextUrl.clone();
          url.pathname = "/upgrade";
          return NextResponse.redirect(url);
        }
      }
    } else if (cachedStatus === "canceled" || cachedStatus === "expired") {
      const url = request.nextUrl.clone();
      url.pathname = "/upgrade";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
