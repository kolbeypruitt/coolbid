import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Hard guard: this module must never load in the browser bundle.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/supabase/admin.ts must not be imported from client components",
  );
}

let cached: SupabaseClient<Database> | null = null;

/**
 * Service-role Supabase client for server-only code paths that need to
 * bypass RLS (public share route, PDF generation, cron jobs, webhooks).
 *
 * Do NOT use this in authenticated routes where RLS should apply —
 * use createClient() from ./server.ts instead.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  cached = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
