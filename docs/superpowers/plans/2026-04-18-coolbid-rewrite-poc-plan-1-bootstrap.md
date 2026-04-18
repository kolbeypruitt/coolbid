# coolbid-rewrite-poc — Plan 1 of 7: Bootstrap & Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new `coolbid-rewrite-poc` repo with Next.js 16 + Supabase auth + the design-token shell, so a contractor can sign up, log in, and land on an empty authed dashboard. No estimates, no catalog, no schema beyond what Supabase Auth ships.

**Architecture:** New sibling repo at `/Users/kolbeypruitt/Workspace/coolbid-rewrite-poc`, same stack as existing coolbid (Next.js 16, React 19, Supabase, Tailwind 4, shadcn v4, Zod, Vitest), separate Supabase project. Most code in this plan is *ported* from coolbid — copied with minimal adaptation. The point is to land the floor, not redesign it.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth + Postgres, `@supabase/ssr`, Tailwind 4, shadcn v4, base-ui, Zod, Vitest, TypeScript 5.

**Spec:** `docs/superpowers/specs/2026-04-18-coolbid-rewrite-poc-design.md` (sections 1, 2, parts of 5).

**Source repo for ports:** `/Users/kolbeypruitt/Workspace/coolbid` (the existing coolbid app).

**Commit discipline:** All commits go through `/commit` per the global protected-workflow rule. Triage will auto-select review level (NONE for configs/docs, LIGHT for source). Each task ends with one commit.

---

## Pre-flight (USER ACTION REQUIRED before Task 1)

The plan needs four things from the user that Claude can't do:

1. **Supabase project.** Create a new project in the Supabase dashboard named `coolbid-rewrite-poc`. Note the project URL, anon key, and service-role key.
2. **Disable email confirmation in the Supabase project for POC.** Authentication → Sign In/Up → Email → toggle "Confirm email" off. Otherwise the signup smoke test in Task 17 needs a real inbox to click a confirmation link before login works. (Re-enable for production at transplant time.)
3. **Anthropic API key.** Reuse existing `ANTHROPIC_API_KEY` or mint a new one for POC isolation.
4. **Confirm the target directory** `/Users/kolbeypruitt/Workspace/coolbid-rewrite-poc` is acceptable. If not, tell the agent the path before starting.

---

## Task 1: Initialize the new repo

**Files:**
- Create: `/Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/.gitignore`
- Create: `/Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/README.md`

- [ ] **Step 1: Create directory and init git**

```bash
mkdir -p /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git init
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
# deps
node_modules/

# next.js
.next/
out/
next-env.d.ts

# build
build/
dist/
*.tsbuildinfo

# env
.env
.env.local
.env.*.local

# supabase
supabase/.branches
supabase/.temp
supabase/.env

# os
.DS_Store

# vercel
.vercel

# test coverage
coverage/

# scheduled tasks
.claude/scheduled_tasks.lock
```

- [ ] **Step 3: Write a one-paragraph `README.md`**

```markdown
# coolbid-rewrite-poc

Standalone POC of the AI-ballpark HVAC estimator. Designed to validate a single conversational intake → AI-generated BOM + labor + narrative → ballpark-priced proposal flow. If validated, the core transplants into the production [coolbid](../coolbid) SaaS shell.

See `docs/spec.md` (copied from the parent repo) for the full design.

## Development

\`\`\`bash
npm install
cp .env.local.example .env.local  # then fill in Supabase + Anthropic keys
npm run dev
\`\`\`
```

- [ ] **Step 4: Initial commit**

```bash
git add .gitignore README.md
git commit -m "chore: init coolbid-rewrite-poc repo"
```

---

## Task 2: package.json + dependencies

**Files:**
- Create: `/Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/package.json`

- [ ] **Step 1: Write `package.json` mirroring coolbid's deps minus the dropped pieces**

```json
{
  "name": "coolbid-rewrite-poc",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "supabase:types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.86.1",
    "@base-ui/react": "^1.3.0",
    "@react-email/components": "^1.0.12",
    "@react-email/render": "^2.0.6",
    "@react-pdf/renderer": "^4.4.0",
    "@supabase/ssr": "^0.10.0",
    "@supabase/supabase-js": "^2.102.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.7.0",
    "next": "16.2.3",
    "next-themes": "^0.4.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "resend": "^6.10.0",
    "shadcn": "^4.2.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.3.6",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^20.19.39",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitest/ui": "^4.1.4",
    "eslint": "^9",
    "eslint-config-next": "16.2.3",
    "jsdom": "^29.0.2",
    "supabase": "^2.88.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^4.1.4"
  }
}
```

(Dropped from coolbid's deps: `pdfjs-dist`, `pdf-parse`, `@types/pdf-parse`, `@resvg/resvg-js`, `stripe` — none are needed for POC.)

- [ ] **Step 2: Install**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npm install
```

Expected: completes without errors. Some peer-dep warnings are fine.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add deps mirroring coolbid (minus floorplan + stripe)"
```

---

## Task 3: TypeScript, ESLint, Next.js, PostCSS, Vitest configs

**Files:**
- Create: `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `components.json`

- [ ] **Step 1: `tsconfig.json`** (port from coolbid)

```bash
cp /Users/kolbeypruitt/Workspace/coolbid/tsconfig.json /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/tsconfig.json
```

- [ ] **Step 2: `next.config.ts`** (port from coolbid)

```bash
cp /Users/kolbeypruitt/Workspace/coolbid/next.config.ts /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/next.config.ts
```

- [ ] **Step 3: `eslint.config.mjs`** (port)

```bash
cp /Users/kolbeypruitt/Workspace/coolbid/eslint.config.mjs /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/eslint.config.mjs
```

- [ ] **Step 4: `postcss.config.mjs`** (port)

```bash
cp /Users/kolbeypruitt/Workspace/coolbid/postcss.config.mjs /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/postcss.config.mjs
```

- [ ] **Step 5: `vitest.config.ts`** (port)

```bash
cp /Users/kolbeypruitt/Workspace/coolbid/vitest.config.ts /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/vitest.config.ts
```

- [ ] **Step 6: `components.json`** (port)

```bash
cp /Users/kolbeypruitt/Workspace/coolbid/components.json /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/components.json
```

- [ ] **Step 7: Sanity-check tsc and eslint compile in an empty repo**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit
```

Expected: no output (clean) or only errors about missing `src/` files (acceptable — we add them next). If config errors appear, stop and resolve.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs vitest.config.ts components.json
git commit -m "chore: tooling configs ported from coolbid"
```

---

## Task 4: Environment variables

**Files:**
- Create: `.env.local.example`
- Create: `.env.local` (gitignored)

- [ ] **Step 1: Write `.env.local.example`**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_PROJECT_ID=YOUR_PROJECT_ID

# Anthropic
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY
ANTHROPIC_MODEL=claude-sonnet-4-6

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 2: User pastes their actual keys into `.env.local`**

This is a USER ACTION. The agent should pause and ask the user to fill in `.env.local` with the values from the new Supabase project + Anthropic key, then continue.

- [ ] **Step 3: Verify `.env.local` is gitignored**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
git check-ignore -v .env.local
```

Expected: output shows `.gitignore:N:.env.local` matched.

- [ ] **Step 4: Commit example file only**

```bash
git add .env.local.example
git commit -m "chore: env vars example"
```

---

## Task 5: Initial Supabase types stub

**Files:**
- Create: `src/types/database.ts`

We don't have any tables yet (Plan 2 adds them). But the supabase clients import a `Database` type — it needs to exist as an empty stub so TypeScript doesn't choke.

- [ ] **Step 1: Write minimal `src/types/database.ts`**

```ts
// Stub regenerated from real Supabase project in Plan 2 once tables exist.
// For now, give the typed clients an empty Database shape they can compile against.
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: stub Database type (real one regenerated in Plan 2)"
```

---

## Task 6: Port Supabase clients

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1: Copy all four clients from coolbid**

```bash
mkdir -p /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/src/lib/supabase
cp /Users/kolbeypruitt/Workspace/coolbid/src/lib/supabase/server.ts \
   /Users/kolbeypruitt/Workspace/coolbid/src/lib/supabase/client.ts \
   /Users/kolbeypruitt/Workspace/coolbid/src/lib/supabase/admin.ts \
   /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/src/lib/supabase/
```

- [ ] **Step 2: Adapt `middleware.ts` from coolbid — remove the onboarding redirect**

The coolbid middleware contains an `onboarding_completed` check that queries a `profiles` table that doesn't exist in the POC yet. Write the simpler POC version directly:

```ts
// src/lib/supabase/middleware.ts
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
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const protectedPaths = ["/dashboard", "/estimates", "/settings", "/catalog", "/onboarding"];
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

  // Onboarding redirect added in Plan 2 once contractors table exists.

  return supabaseResponse;
}
```

- [ ] **Step 3: Verify everything compiles**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat(supabase): port server/client/admin/middleware (no onboarding redirect yet)"
```

---

## Task 7: Tailwind 4 globals + design tokens

**Files:**
- Create: `src/app/globals.css`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Port `globals.css` and `utils.ts` from coolbid**

```bash
mkdir -p /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/src/app
cp /Users/kolbeypruitt/Workspace/coolbid/src/app/globals.css /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/src/app/globals.css
mkdir -p /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/src/lib
cp /Users/kolbeypruitt/Workspace/coolbid/src/lib/utils.ts /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/src/lib/utils.ts
```

- [ ] **Step 2: Verify utils.ts compiles**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css src/lib/utils.ts
git commit -m "feat(ui): port Tailwind 4 globals + design tokens + cn util"
```

---

## Task 8: Install shadcn primitives we need for Plan 1

**Files:**
- Create: `src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`

We only need a small set for the auth pages and the empty shell. Install more in later plans as needed.

- [ ] **Step 1: Run shadcn init**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx shadcn@latest init
```

Behavior: since `components.json` already exists from Task 3, init should detect it and only ensure deps/registry are wired. If prompted to overwrite `components.json`, choose "no" and let it use the existing one. If prompted for `globals.css` location, confirm `src/app/globals.css`.

- [ ] **Step 2: Install primitives**

```bash
npx shadcn@latest add button card input label
```

Expected: files appear in `src/components/ui/`.

- [ ] **Step 3: Verify they compile**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/ components.json
git commit -m "feat(ui): install shadcn primitives (button, card, input, label)"
```

---

## Task 9: Root layout + metadata

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/icon.svg` (placeholder OK)
- Create: `src/app/favicon.ico` (placeholder OK)

- [ ] **Step 1: Write `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "coolbid — Describe a job. Send a proposal.",
    template: "%s · coolbid",
  },
  description:
    "AI-powered HVAC estimator. Describe a job in plain language and send a polished proposal in 60 seconds.",
  applicationName: "coolbid",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Drop a placeholder icon (so Next doesn't 404)**

```bash
cp /Users/kolbeypruitt/Workspace/coolbid/src/app/icon.svg /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/src/app/icon.svg
cp /Users/kolbeypruitt/Workspace/coolbid/src/app/favicon.ico /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/src/app/favicon.ico
```

- [ ] **Step 3: Boot dev server, verify root renders**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npm run dev
```

Open `http://localhost:3000`. Expected: blank page (no error). Stop server with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/icon.svg src/app/favicon.ico
git commit -m "feat(app): root layout + metadata + Sonner toaster"
```

---

## Task 10: Marketing landing page

**Files:**
- Create: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Write minimal landing page**

```tsx
// src/app/(marketing)/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Describe a job. Send a proposal in 60 seconds.
        </h1>
        <p className="text-xl text-muted-foreground">
          AI-powered HVAC estimating. No floorplans, no spreadsheets, no parts databases.
          Just type what you&apos;re bidding and send the homeowner a polished number today.
        </p>
        <div className="flex gap-3 justify-center">
          <Button asChild size="lg">
            <Link href="/auth/signup">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Note: shadcn v4 + base-ui doesn't ship `asChild` everywhere. If `<Button asChild>` doesn't work in this version, replace with a plain anchor styled via `cn(buttonVariants(...))`. Verify by booting the dev server.

- [ ] **Step 2: Boot dev server, verify the landing page renders correctly**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: hero, two CTAs visible. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(marketing\)/page.tsx
git commit -m "feat(landing): minimal hero + two CTAs"
```

---

## Task 11: Auth proxy (Next 16 middleware-equivalent)

**Files:**
- Create: `src/proxy.ts`

In Next.js 16, what was previously `middleware.ts` is now `proxy.ts`. The current coolbid app uses this convention.

- [ ] **Step 1: Write `src/proxy.ts`**

```ts
// src/proxy.ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Verify by visiting protected route while logged out**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard`. Expected: redirect to `/auth/login` (which doesn't exist yet — will 404). The redirect itself happening is the verification. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(proxy): wire updateSession + protect /dashboard etc"
```

---

## Task 12: Auth login page

**Files:**
- Create: `src/app/auth/login/page.tsx`

- [ ] **Step 1: Port simplified login from coolbid (drop Google OAuth — POC is email+password only)**

```tsx
// src/app/auth/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to coolbid</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Boot dev server, verify the form renders**

```bash
npm run dev
```

Open `http://localhost:3000/auth/login`. Expected: card with email + password + button. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/login/page.tsx
git commit -m "feat(auth): login page (email+password)"
```

---

## Task 13: Auth signup page

**Files:**
- Create: `src/app/auth/signup/page.tsx`

- [ ] **Step 1: Port simplified signup (email+password only, no company name field — that lives in onboarding in Plan 2)**

```tsx
// src/app/auth/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Plan 2 redirects to /onboarding here; for now go to /dashboard
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Start estimating in 60 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Sign up"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Boot, verify the page renders**

```bash
npm run dev
```

Open `http://localhost:3000/auth/signup`. Expected: signup card. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/signup/page.tsx
git commit -m "feat(auth): signup page (email+password)"
```

---

## Task 14: Auth callback route

**Files:**
- Create: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Port from coolbid**

```ts
// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
```

- [ ] **Step 2: Boot, verify route exists (should NOT 404 — visit it raw)**

```bash
npm run dev
```

Open `http://localhost:3000/auth/callback`. Expected: redirect to `/auth/login?error=auth_failed` (no `code` param means failure). The redirect happening is the verification. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat(auth): OAuth callback route"
```

---

## Task 15: (app) shell layout with sidebar + placeholder pages

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/estimates/page.tsx`
- Create: `src/app/(app)/catalog/page.tsx`
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Sidebar component**

```tsx
// src/components/layout/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, BookOpen, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/estimates", label: "Estimates", icon: FileText },
  { href: "/catalog", label: "Catalog", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 border-r bg-card flex flex-col">
      <div className="p-4 border-b">
        <Link href="/dashboard" className="text-xl font-bold">
          coolbid
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: (app) layout**

```tsx
// src/app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Placeholder pages — dashboard**

```tsx
// src/app/(app)/dashboard/page.tsx
export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="text-muted-foreground">
        Estimates list, recent activity, and the &ldquo;+ New Estimate&rdquo;
        button live here. Plan 7 wires this up.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Placeholder pages — estimates**

```tsx
// src/app/(app)/estimates/page.tsx
export default function EstimatesPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2">Estimates</h1>
      <p className="text-muted-foreground">List of estimates — wired in Plan 5.</p>
    </div>
  );
}
```

- [ ] **Step 5: Placeholder pages — catalog**

```tsx
// src/app/(app)/catalog/page.tsx
export default function CatalogPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2">Catalog</h1>
      <p className="text-muted-foreground">Editable catalog — wired in Plan 3.</p>
    </div>
  );
}
```

- [ ] **Step 6: Placeholder pages — settings**

```tsx
// src/app/(app)/settings/page.tsx
export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-muted-foreground">Company profile + defaults — wired in Plan 2.</p>
    </div>
  );
}
```

- [ ] **Step 7: tsc + lint**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npx tsc --noEmit && npm run lint
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/ src/components/layout/sidebar.tsx
git commit -m "feat(shell): authed (app) layout + sidebar + placeholder pages"
```

---

## Task 16: AGENTS.md + CLAUDE.md

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

- [ ] **Step 1: Write `AGENTS.md`**

```markdown
# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Project context

This is `coolbid-rewrite-poc` — a standalone POC of an AI-ballpark HVAC estimator. The full design lives in `docs/spec.md`, which is the source of truth. Read it first.

The companion (older) repo at `../coolbid` is the SaaS shell that this POC will eventually transplant into. Reuse code from `../coolbid` by copy-paste port, never by import or workspace link.

# Build sequence

7 sequenced plans in `docs/plans/`:
1. Bootstrap & Auth ← we are here at start
2. Schema, Onboarding & Settings
3. Catalog Editor
4. AI Pipeline & Intake
5. Estimate Editor & Recalc
6. Share & Public View
7. Polish + dashboard list + smoke tests

Each plan produces working software. Do not skip ahead.
```

- [ ] **Step 2: Write `CLAUDE.md`**

```markdown
@AGENTS.md
```

- [ ] **Step 3: Copy the spec into the new repo for reference**

```bash
mkdir -p /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/docs/plans
cp /Users/kolbeypruitt/Workspace/coolbid/docs/superpowers/specs/2026-04-18-coolbid-rewrite-poc-design.md \
   /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/docs/spec.md
cp /Users/kolbeypruitt/Workspace/coolbid/docs/superpowers/plans/2026-04-18-coolbid-rewrite-poc-plan-1-bootstrap.md \
   /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc/docs/plans/plan-1-bootstrap.md
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md docs/
git commit -m "docs: AGENTS/CLAUDE + import spec and plan-1 into repo"
```

---

## Task 17: End-to-end smoke verification

This is the only task that's a manual verification, not code-and-commit. It catches integration bugs before we head into Plan 2.

- [ ] **Step 1: Boot dev server**

```bash
cd /Users/kolbeypruitt/Workspace/coolbid-rewrite-poc
npm run dev
```

- [ ] **Step 2: Verify landing**

Open `http://localhost:3000`. Expected: hero, two CTAs.

- [ ] **Step 3: Verify protected redirect**

Navigate to `http://localhost:3000/dashboard`. Expected: redirect to `/auth/login`.

- [ ] **Step 4: Sign up an account**

Click "Get started" or open `/auth/signup`. Use a real email (a Supabase test address works). Submit. Expected: redirect to `/dashboard`. Sidebar visible with Estimates, Catalog, Settings nav.

- [ ] **Step 5: Verify nav items load**

Click each sidebar item. Expected: each placeholder page renders correctly.

- [ ] **Step 6: Sign out and back in**

Sign out via Supabase dashboard (or add a temporary sign-out button if needed — DO NOT add one to the codebase, do it manually in the database/console for the smoke test). Then `/auth/login` with the credentials. Expected: lands back on `/dashboard`.

- [ ] **Step 7: Confirm `npm run build` succeeds**

```bash
npm run build
```

Expected: clean build, no type errors, no eslint blockers.

- [ ] **Step 8: Final commit checkpoint (no code changes — just verifying state)**

```bash
git log --oneline -20
git status
```

Expected: clean working tree, ~16 commits matching the task headings above.

---

## Plan 1 Done — what works now

✅ New repo at `/Users/kolbeypruitt/Workspace/coolbid-rewrite-poc` with the same stack as coolbid
✅ Contractor can sign up with email+password
✅ Contractor can log in and out
✅ Authed shell with sidebar (Estimates, Catalog, Settings) — all placeholder pages
✅ Tailwind 4 + design tokens + shadcn primitives ready
✅ Marketing landing page at `/`
✅ All quality gates pass (tsc, lint, build)

## What's intentionally missing (added in later plans)

- ❌ No `contractors` profile table (Plan 2)
- ❌ No onboarding flow / no settings form (Plan 2)
- ❌ No catalog (Plan 2 schema, Plan 3 editor)
- ❌ No estimates (Plan 4–5)
- ❌ No share view (Plan 6)
- ❌ No PDF export (Plan 7, optional)
- ❌ Sidebar has no sign-out button (deferred — use Supabase dashboard for now)

## Next: Plan 2 — Schema, Onboarding & Settings
