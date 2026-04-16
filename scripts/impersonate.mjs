#!/usr/bin/env node
// Generate a one-time magic link to sign in as another user.
// Local-only: requires the service-role key, never deploy this.
//
// Usage:
//   node --env-file=.env.local scripts/impersonate.mjs <email> [redirect-path]
//
// Example:
//   node --env-file=.env.local scripts/impersonate.mjs havacman11@yahoo.com /dashboard

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const redirectPath = process.argv[3] ?? "/";

if (!email) {
  console.error("usage: node --env-file=.env.local scripts/impersonate.mjs <email> [redirect-path]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "http://localhost:3000";

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: new URL(redirectPath, siteUrl).toString() },
});

if (error) {
  console.error("Failed to generate link:", error.message);
  process.exit(1);
}

const link = data?.properties?.action_link;
if (!link) {
  console.error("No action_link returned. Raw response:", JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("\nMagic link for", email);
console.log("(one-time use, expires shortly — paste into your browser)\n");
console.log(link);
console.log();
