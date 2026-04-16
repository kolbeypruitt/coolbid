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
let totalClassified = 0;
let iterations = 0;
const startedAt = Date.now();

while (true) {
  iterations += 1;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`, await res.text());
    process.exit(1);
  }
  const { classified, remaining } = await res.json();
  totalClassified += classified;
  console.log(
    `iter=${iterations} classified=${classified} total=${totalClassified} remaining=${remaining}`,
  );
  if (remaining === 0 || classified === 0) break;
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`Done. Total classified: ${totalClassified} in ${elapsed}s.`);
