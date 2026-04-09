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

  return supabaseResponse;
}
