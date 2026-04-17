#!/usr/bin/env node
// One-shot runner that hammers /api/internal/classify-vendor-products until
// the `remaining` count reaches 0. Safe to re-run; the endpoint only touches
// rows where bom_classified_at IS NULL.
//
// Usage:
//   BASE_URL=http://localhost:3000 INTERNAL_API_TOKEN=... \
//     node scripts/backfill-vendor-classification.mjs

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const token = process.env.INTERNAL_API_TOKEN;
if (!token) {
  console.error("INTERNAL_API_TOKEN must be set");
  process.exit(1);
}

const url = `${baseUrl}/api/internal/classify-vendor-products`;
const MAX_RETRIES = 6;
const REQUEST_TIMEOUT_MS = 90_000; // Per-request wall clock; server has maxDuration=300s.

async function postWithRetry() {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES) break;
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s cap.
      const backoff = Math.min(2000 * 2 ** (attempt - 1), 60_000);
      const msg = err?.cause?.code ?? err?.code ?? err?.message ?? err;
      console.warn(
        `  ↳ retry ${attempt}/${MAX_RETRIES} after ${backoff}ms — ${msg}`,
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

let totalClassified = 0;
let iterations = 0;
const startedAt = Date.now();

while (true) {
  iterations += 1;
  let body;
  try {
    body = await postWithRetry();
  } catch (err) {
    console.error(`\nFailed after ${MAX_RETRIES} retries at iter ${iterations}:`, err);
    console.error(`Progress so far: classified=${totalClassified}`);
    console.error(`Re-run the script to resume — it picks up where it left off.`);
    process.exit(1);
  }
  const { classified, remaining } = body;
  totalClassified += classified;
  console.log(
    `iter=${iterations} classified=${classified} total=${totalClassified} remaining=${remaining}`,
  );
  if (remaining === 0 || classified === 0) break;
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`Done. Total classified: ${totalClassified} in ${elapsed}s.`);
