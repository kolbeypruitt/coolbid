# BOM Generation v2 — vendor_products matching + persistence + preferences

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BOM generation actually use the 30k scraped vendor_products (not just per-user `equipment_catalog`), auto-persist the wizard-generated BOM so it survives navigation, and ensure contractor preferences (brands, register style, filter size/MERV) apply to vendor_products matches too.

**Architecture:**
1. A pure classifier (`src/lib/hvac/vendor-classifier.ts`) maps each `vendor_products` row to `CatalogItem` shape by deriving `equipment_type` from `category_path`, extracting `tonnage` from name/MPN, and defaulting `system_type` to `"universal"`. The existing `generateBOM` logic then works unchanged against the combined catalog.
2. Both generate paths (`use-estimator.ts` wizard, `regenerate-bom.ts` server) fetch vendor_products scoped to the user's active-supplier linked vendors (same scoping as the existing `browseVendorProducts` function in `src/app/api/catalog/route.ts:171-267`), classify, and concat with the user's `equipment_catalog` before calling `generateBOM`.
3. Wizard-side persistence: `generateBom` in `use-estimator.ts` writes to `estimate_bom_items` immediately (not only on "Done — View Estimate" click). Adds a prominent empty-state BOM card on `/estimates/[id]` when `bom.length === 0`.

**Tech Stack:** Next.js 16 App Router, Supabase (postgres + supabase-js), TypeScript, Vitest.

---

## File structure

**Create:**
- `src/lib/hvac/vendor-classifier.ts` — pure classifier: `VendorProductRow → CatalogItem | null`
- `src/lib/hvac/__tests__/vendor-classifier.test.ts` — classifier unit tests
- `src/lib/hvac/__tests__/bom-generator-vendor.test.ts` — end-to-end BOM tests using classified vendor_products
- `src/lib/estimates/load-bom-catalog.ts` — shared loader that returns `equipment_catalog + classified vendor_products`
- `src/components/estimates/empty-bom-card.tsx` — empty-state CTA when estimate has no BOM rows

**Modify:**
- `src/types/hvac.ts:30-34` — extend `BomItem.source` union to include `"imported"` so classified-vendor items aren't cast-laundered
- `src/lib/hvac/bom-generator.ts:108-122` — `catalogToBomItem` no longer needs an unsafe cast on `source`
- `src/lib/estimates/regenerate-bom.ts:55-66` — swap raw `equipment_catalog` fetch for the shared loader
- `src/hooks/use-estimator.ts:378-441` — swap catalog fetch for shared loader AND persist BOM immediately after generation
- `src/app/(app)/estimates/[id]/page.tsx:210-218,297-306` — render `EmptyBomCard` in place of (or alongside) the recovery banner when `bom.length === 0 && rooms.length > 0`

---

## Task 1: Extend `BomItem.source` to include `"imported"`

**Files:**
- Modify: `src/types/hvac.ts:30-34`
- Modify: `src/lib/hvac/bom-generator.ts:108-122`
- Modify: `src/lib/hvac/bom-from-saved.ts:18-30`
- Modify: `src/components/ui/source-badge.tsx` (already handles `"imported"` — verify)

- [ ] **Step 1: Edit `src/types/hvac.ts` line 32 `BomItem`**

Change:
```ts
source: "starter" | "quote" | "manual" | "missing";
```
to:
```ts
source: "starter" | "quote" | "manual" | "imported" | "missing";
```

- [ ] **Step 2: Remove unsafe cast in `src/lib/hvac/bom-generator.ts:119`**

Change:
```ts
source: item.source as BomItem["source"],
```
to:
```ts
source: item.source,
```
(After Step 1 the types line up — `CatalogSource` is `"starter" | "quote" | "manual" | "imported"`, a subset of the new `BomItem["source"]`.)

- [ ] **Step 3: Verify `SourceBadge` renders `"imported"` correctly**

Read `src/components/ui/source-badge.tsx:7-9`. Expected: `<Badge ...>Imported</Badge>`. No change required.

- [ ] **Step 4: Run type check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/hvac.ts src/lib/hvac/bom-generator.ts
git commit -m "types: add 'imported' to BomItem.source union"
```

---

## Task 2: Classifier — `vendor-classifier.ts` (TDD)

**Files:**
- Create: `src/lib/hvac/vendor-classifier.ts`
- Create: `src/lib/hvac/__tests__/vendor-classifier.test.ts`

**Design:** Pure function `classifyVendorProduct(p: VendorProductRow): CatalogItem | null`. Returns `null` when the row is clearly unrelated to HVAC BOM needs (plumbing, boilers, water heaters, tools). Output `source = "imported"`, `user_id = ""` (sentinel — never written back to DB), `supplier_id = null`, `vendor_product_id = p.id`, `mpn = p.mpn ?? p.sku`, `description = [p.name, p.short_description].filter(Boolean).join(" — ")`, `unit_of_measure = "ea"`.

### Classifier category map (derived from real backup data)

| category_path fragment | equipment_type | Notes |
|---|---|---|
| `Residential-Unitary/Split-Systems` + name contains "condenser" or "condensing unit" | `ac_condenser` or `heat_pump_condenser` (HP if name contains "heat pump") | Most common |
| `Residential-Unitary/Single-Packaged-Units` | `ac_condenser` | Combined unit, treat as condenser |
| `Residential-Unitary/Gas-Furnaces` | `gas_furnace` | |
| `Residential-Unitary/Air-Handlers-Evaporator-Coils` + name contains "coil" | `evap_coil` | |
| `Residential-Unitary/Air-Handlers-Evaporator-Coils` (else) | `air_handler` | |
| `Specialty/Heaters-Furnaces` + name contains "strip" | `heat_strips` | |
| `Thermostats/*` | `thermostat` | |
| `Air-Distribution-*/Ducting-Sheet-Metal` | `ductwork` | |
| `Air-Distribution-*/Registers` | `register` | |
| `Air-Distribution-*/Grilles` or `*/Diffusers` | `grille` | |
| `Refrigeration/Refrigerant/*` | `refrigerant` | |
| `Installation-Maintenance-Supplies/Line-Sets` | `refrigerant` | Line sets treated as refrigerant bucket (matches existing generator convention) |
| `Electrical-Installation-Maintenance-Supplies/*` | `electrical` | |
| `Installation-Maintenance-Supplies/Condensate-Pumps` | `installation` | |
| `Installation-Maintenance-Supplies/Condensate-Drain-Supplies` | `installation` | |
| `Installation-Maintenance-Supplies/Condensing-Unit-Pads-Covers` | `installation` | |
| `Installation-Maintenance-Supplies/Tapes` + name contains "foil" | `installation` | |
| `Installation-Maintenance-Supplies/Mounting-Supplies` + name contains "hanger" or "strap" | `installation` | |
| `Installation-Maintenance-Supplies/Adhesives` + name contains "mastic" | `installation` | |
| Filter-Air / Filters under `HVACR-Parts` or `Supplies` + name matches filter-sized pattern | `installation` | Filters are classed as installation in existing generator |
| (anything else) | `null` (skip) | |

### Tonnage extraction

Regex against `name` AND `mpn`:
```ts
// Matches "2T", "2 Ton", "2.5T", "3-ton", "036" (BTU-divided-by-1000 code: 024/030/036/042/048/060)
const TON_FROM_T = /(\d+(?:\.\d)?)\s*-?\s*t(?:on)?\b/i;
const TON_FROM_BTU_CODE = /\b0?(18|24|30|36|42|48|60)\b/;
```
- `18` → 1.5, `24` → 2, `30` → 2.5, `36` → 3, `42` → 3.5, `48` → 4, `60` → 5.

Only extract tonnage for equipment types where it matters: `ac_condenser`, `heat_pump_condenser`, `air_handler`, `evap_coil`, `gas_furnace`. For everything else, return `null`.

### system_type

Always return `"universal"` — matching in `generateBOM` uses `c.system_type === "universal" || c.system_type === systemType`, and we don't reliably know system_type from vendor text. Equipment-type filter + brand preferences do the work.

- [ ] **Step 1: Write failing tests `src/lib/hvac/__tests__/vendor-classifier.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { classifyVendorProduct } from "../vendor-classifier";
import type { VendorProductRow } from "@/types/catalog";

function row(overrides: Partial<VendorProductRow>): VendorProductRow {
  return {
    id: "v1",
    vendor_id: "vend1",
    sku: "SKU1",
    mpn: null,
    name: "Test",
    brand: "Goodman",
    image_url: null,
    short_description: null,
    category_root: "HVAC-Equipment",
    category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
    category_leaf: "Split Systems",
    detail_url: null,
    price: 100,
    price_text: null,
    last_priced_at: null,
    vendor: null,
    ...overrides,
  };
}

describe("classifyVendorProduct", () => {
  it("classifies heat pump condenser", () => {
    const r = classifyVendorProduct(row({ name: "3 Ton Heat Pump Condenser", mpn: "GSZ160361" }));
    expect(r?.equipment_type).toBe("heat_pump_condenser");
    expect(r?.tonnage).toBe(3);
    expect(r?.system_type).toBe("universal");
    expect(r?.source).toBe("imported");
  });

  it("classifies AC condenser from split systems + condenser keyword", () => {
    const r = classifyVendorProduct(row({ name: "2.5 Ton AC Condensing Unit", mpn: "GSX160301" }));
    expect(r?.equipment_type).toBe("ac_condenser");
    expect(r?.tonnage).toBe(2.5);
  });

  it("classifies gas furnace", () => {
    const r = classifyVendorProduct(row({
      name: "80K BTU 80% Gas Furnace",
      mpn: "GMSS960803BN",
      category_path: "HVAC-Equipment/Residential-Unitary/Gas-Furnaces",
      category_leaf: "Gas Furnaces",
    }));
    expect(r?.equipment_type).toBe("gas_furnace");
  });

  it("classifies air handler (no coil keyword)", () => {
    const r = classifyVendorProduct(row({
      name: "3 Ton Multi-Position Air Handler",
      mpn: "ARUF37C14",
      category_path: "HVAC-Equipment/Residential-Unitary/Air-Handlers-Evaporator-Coils",
      category_leaf: "Air Handlers & Evaporator Coils",
    }));
    expect(r?.equipment_type).toBe("air_handler");
    expect(r?.tonnage).toBe(3);
  });

  it("classifies evap coil (name has coil)", () => {
    const r = classifyVendorProduct(row({
      name: "3 Ton Cased Evaporator Coil",
      mpn: "CAUF3642C6",
      category_path: "HVAC-Equipment/Residential-Unitary/Air-Handlers-Evaporator-Coils",
      category_leaf: "Air Handlers & Evaporator Coils",
    }));
    expect(r?.equipment_type).toBe("evap_coil");
  });

  it("classifies thermostat", () => {
    const r = classifyVendorProduct(row({
      name: "Honeywell T6 Pro Programmable Thermostat",
      brand: "Honeywell",
      category_path: "Controls/Thermostats/Thermostats/Digital-Programmable-Thermostats",
      category_leaf: "Digital Programmable Thermostats",
    }));
    expect(r?.equipment_type).toBe("thermostat");
    expect(r?.tonnage).toBeNull();
  });

  it("classifies sheet metal ductwork", () => {
    const r = classifyVendorProduct(row({
      name: "8x12 Sheet Metal Trunk Duct",
      category_path: "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Ducting-Sheet-Metal",
      category_leaf: "Ducting Sheet Metal",
    }));
    expect(r?.equipment_type).toBe("ductwork");
  });

  it("classifies register", () => {
    const r = classifyVendorProduct(row({
      name: "4x12 Supply Register Aluminum",
      category_path: "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Registers",
      category_leaf: "Registers",
    }));
    expect(r?.equipment_type).toBe("register");
  });

  it("classifies return grille", () => {
    const r = classifyVendorProduct(row({
      name: "20x25 Return Air Grille",
      category_path: "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Grilles",
      category_leaf: "Grilles",
    }));
    expect(r?.equipment_type).toBe("grille");
  });

  it("classifies R-410A refrigerant", () => {
    const r = classifyVendorProduct(row({
      name: "R-410A Refrigerant 25lb Cylinder",
      category_path: "Refrigeration/Refrigerant/R410A",
      category_leaf: "R410A",
    }));
    expect(r?.equipment_type).toBe("refrigerant");
  });

  it("classifies line set under refrigerant bucket", () => {
    const r = classifyVendorProduct(row({
      name: "3/8 x 7/8 Line Set 25ft",
      category_path: "Supplies/Installation-Maintenance-Supplies/Line-Sets",
      category_leaf: "Line Sets",
    }));
    expect(r?.equipment_type).toBe("refrigerant");
  });

  it("classifies electrical whip", () => {
    const r = classifyVendorProduct(row({
      name: '3/4" Conduit Whip 6ft',
      category_path: "Supplies/Electrical-Installation-Maintenance-Supplies/Whips",
      category_leaf: "Whips",
    }));
    expect(r?.equipment_type).toBe("electrical");
  });

  it("classifies condensate pump as installation", () => {
    const r = classifyVendorProduct(row({
      name: "Little Giant Condensate Pump",
      category_path: "Supplies/Installation-Maintenance-Supplies/Condensate-Pumps",
      category_leaf: "Condensate Pumps",
    }));
    expect(r?.equipment_type).toBe("installation");
  });

  it("returns null for unrelated (boiler)", () => {
    const r = classifyVendorProduct(row({
      name: "Cast Iron Boiler 100K BTU",
      category_path: "Hydronics-Plumbing/Equipment/Boilers",
      category_leaf: "Boilers",
    }));
    expect(r).toBeNull();
  });

  it("extracts tonnage from BTU-code in MPN", () => {
    const r = classifyVendorProduct(row({
      name: "Split System",
      mpn: "GSX160361",
      category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
    }));
    expect(r?.tonnage).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/hvac/__tests__/vendor-classifier.test.ts
```
Expected: all fail — `classifyVendorProduct` not exported yet.

- [ ] **Step 3: Implement `src/lib/hvac/vendor-classifier.ts`**

```ts
import type { CatalogItem, EquipmentType, VendorProductRow } from "@/types/catalog";

const TON_FROM_T = /(\d+(?:\.\d)?)\s*-?\s*t(?:on)?\b/i;
const TON_FROM_BTU_CODE = /\b0?(18|24|30|36|42|48|60)\b/;
const BTU_CODE_TO_TON: Record<string, number> = {
  "18": 1.5, "24": 2, "30": 2.5, "36": 3, "42": 3.5, "48": 4, "60": 5,
};

const EQUIPMENT_TYPES_WITH_TONNAGE = new Set<EquipmentType>([
  "ac_condenser",
  "heat_pump_condenser",
  "air_handler",
  "evap_coil",
  "gas_furnace",
]);

function extractTonnage(name: string, mpn: string | null): number | null {
  const haystack = `${name} ${mpn ?? ""}`;
  const tMatch = haystack.match(TON_FROM_T);
  if (tMatch) {
    const n = parseFloat(tMatch[1]);
    if (!Number.isNaN(n) && n > 0 && n <= 20) return n;
  }
  const btuMatch = (mpn ?? "").match(TON_FROM_BTU_CODE) ?? name.match(TON_FROM_BTU_CODE);
  if (btuMatch) {
    return BTU_CODE_TO_TON[btuMatch[1].replace(/^0/, "")] ?? null;
  }
  return null;
}

function deriveEquipmentType(p: VendorProductRow): EquipmentType | null {
  const path = (p.category_path ?? "").toLowerCase();
  const name = (p.name ?? "").toLowerCase();
  const leaf = (p.category_leaf ?? "").toLowerCase();

  if (path.includes("residential-unitary/split-systems")
      || path.includes("residential-unitary/single-packaged-units")) {
    if (name.includes("heat pump")) return "heat_pump_condenser";
    if (name.includes("condens") || name.includes("condenser")) return "ac_condenser";
    return "ac_condenser";
  }
  if (path.includes("residential-unitary/gas-furnaces")) return "gas_furnace";
  if (path.includes("residential-unitary/air-handlers-evaporator-coils")) {
    if (name.includes("coil")) return "evap_coil";
    return "air_handler";
  }
  if (path.includes("specialty/heaters-furnaces") && name.includes("strip")) return "heat_strips";
  if (path.includes("thermostats")) return "thermostat";
  if (path.includes("ducting-sheet-metal") || leaf === "ducting sheet metal") return "ductwork";
  if (leaf === "registers") return "register";
  if (leaf === "grilles" || leaf === "diffusers") return "grille";
  if (path.includes("refrigeration/refrigerant/")) return "refrigerant";
  if (path.includes("installation-maintenance-supplies/line-sets")) return "refrigerant";
  if (path.includes("electrical-installation-maintenance-supplies/")) return "electrical";
  if (path.includes("installation-maintenance-supplies/condensate-pumps")) return "installation";
  if (path.includes("installation-maintenance-supplies/condensate-drain-supplies")) return "installation";
  if (path.includes("installation-maintenance-supplies/condensing-unit-pads-covers")) return "installation";
  if (path.includes("installation-maintenance-supplies/tapes") && name.includes("foil")) return "installation";
  if (path.includes("installation-maintenance-supplies/mounting-supplies")
      && (name.includes("hanger") || name.includes("strap"))) return "installation";
  if (path.includes("installation-maintenance-supplies/adhesives") && name.includes("mastic")) return "installation";
  if (path.includes("filter-air") || (leaf === "filters" && /\d+x\d+/.test(name))) return "installation";

  return null;
}

export function classifyVendorProduct(p: VendorProductRow): CatalogItem | null {
  const equipment_type = deriveEquipmentType(p);
  if (!equipment_type) return null;

  const tonnage = EQUIPMENT_TYPES_WITH_TONNAGE.has(equipment_type)
    ? extractTonnage(p.name, p.mpn)
    : null;

  const description = [p.name, p.short_description].filter(Boolean).join(" — ");

  return {
    id: `vendor:${p.id}`,
    user_id: "",
    supplier_id: null,
    vendor_product_id: p.id,
    mpn: p.mpn ?? p.sku,
    description,
    equipment_type,
    system_type: "universal",
    brand: p.brand ?? "",
    tonnage,
    seer_rating: null,
    btu_capacity: null,
    stages: null,
    refrigerant_type: null,
    unit_price: p.price,
    unit_of_measure: "ea",
    source: "imported",
    usage_count: 0,
    last_quoted_date: null,
    created_at: "",
    updated_at: "",
  };
}

export function classifyVendorProducts(rows: VendorProductRow[]): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const r of rows) {
    const item = classifyVendorProduct(r);
    if (item) out.push(item);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/hvac/__tests__/vendor-classifier.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hvac/vendor-classifier.ts src/lib/hvac/__tests__/vendor-classifier.test.ts
git commit -m "feat(hvac): classify vendor_products rows into CatalogItem shape"
```

---

## Task 3: Shared catalog loader `load-bom-catalog.ts`

**Files:**
- Create: `src/lib/estimates/load-bom-catalog.ts`
- Create: `src/lib/estimates/__tests__/load-bom-catalog.test.ts` (integration-style, with mocked supabase)

**Behavior:** given a Supabase client + userId, load:
1. `equipment_catalog` (user-scoped, active suppliers only) — priority items.
2. `vendor_products` scoped to `vendor_id IN (vendor_ids from user's active suppliers)` (matches `browseVendorProducts` scoping in `src/app/api/catalog/route.ts:193-221`).
3. Classify vendor_products → CatalogItem[] (skipping `null` returns).
4. Concat `[...equipmentCatalog, ...classifiedVendor]` so `sortByPreference`'s `usage_count` tiebreaker naturally prefers user-catalog items (vendor rows have `usage_count: 0`).

- [ ] **Step 1: Implement `src/lib/estimates/load-bom-catalog.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogItem, VendorProductRow } from "@/types/catalog";
import { classifyVendorProducts } from "@/lib/hvac/vendor-classifier";

const VENDOR_SELECT =
  "id, vendor_id, sku, mpn, name, brand, image_url, short_description, category_root, category_path, category_leaf, detail_url, price, price_text, last_priced_at, vendor:vendors(id, slug, name)";

export async function loadBomCatalog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
): Promise<CatalogItem[]> {
  const [{ data: userCat }, { data: supplierRows }] = await Promise.all([
    supabase
      .from("equipment_catalog")
      .select("*, supplier:suppliers(*)")
      .eq("user_id", userId)
      .order("usage_count", { ascending: false }),
    supabase
      .from("suppliers")
      .select("vendor_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .not("vendor_id", "is", null),
  ]);

  const activeUserCat = ((userCat ?? []) as CatalogItem[]).filter(
    (i) => i.supplier?.is_active !== false,
  );

  const vendorIds = Array.from(
    new Set(
      ((supplierRows ?? []) as Array<{ vendor_id: string | null }>)
        .map((r) => r.vendor_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  if (vendorIds.length === 0) return activeUserCat;

  const { data: vendorRows } = await supabase
    .from("vendor_products")
    .select(VENDOR_SELECT)
    .in("vendor_id", vendorIds);

  const classified = classifyVendorProducts((vendorRows ?? []) as VendorProductRow[]);
  return [...activeUserCat, ...classified];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/estimates/load-bom-catalog.ts
git commit -m "feat(estimates): shared loader — equipment_catalog + classified vendor_products"
```

---

## Task 4: Wire loader into `regenerate-bom.ts`

**Files:**
- Modify: `src/lib/estimates/regenerate-bom.ts:55-66`

- [ ] **Step 1: Edit `regenerate-bom.ts`**

Replace lines 55-66:
```ts
  // Fetch current catalog
  const { data: catalog, error: catErr } = await supabase
    .from("equipment_catalog")
    .select("*, supplier:suppliers(*)")
    .order("usage_count", { ascending: false });

  if (catErr) return { error: "Failed to load equipment catalog" };

  // Hide items from inactive suppliers (user toggled them off).
  const activeCatalog = ((catalog ?? []) as CatalogItem[]).filter(
    (item) => item.supplier?.is_active !== false,
  );
```
with:
```ts
  const activeCatalog = await loadBomCatalog(supabase, user.id);
```

Add the import at the top:
```ts
import { loadBomCatalog } from "@/lib/estimates/load-bom-catalog";
```

Remove the now-unused `CatalogItem` import if nothing else uses it in this file.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/estimates/regenerate-bom.ts
git commit -m "feat(bom): regenerate-bom uses shared loader (vendor_products included)"
```

---

## Task 5: Wire loader into `use-estimator.ts` AND auto-persist BOM

**Files:**
- Modify: `src/hooks/use-estimator.ts:378-441`

- [ ] **Step 1: Replace catalog fetch with shared loader**

Read lines 378-441 first, then replace the catalog fetch (lines 381-389) with:
```ts
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
const activeCatalog = user
  ? await loadBomCatalog(supabase, user.id)
  : [];
```

Add import at the top of the file:
```ts
import { loadBomCatalog } from "@/lib/estimates/load-bom-catalog";
```

- [ ] **Step 2: Persist BOM immediately after generation**

After `set({ bom, step: "bom" });` at line 437, but BEFORE the closing `}` of the try block, add:
```ts
// Persist immediately so navigating away from the wizard doesn't lose the BOM.
if (estimateId && bom.items.length > 0) {
  const bomRows = toBomInsertRows(bom.items, estimateId);
  await supabase.from("estimate_bom_items").delete().eq("estimate_id", estimateId);
  const { error: bomErr } = await supabase.from("estimate_bom_items").insert(bomRows);
  if (bomErr) {
    console.error("[use-estimator] auto-persist BOM failed:", bomErr.message);
  }
}
```

Ensure `toBomInsertRows` is imported at the top:
```ts
import { toBomInsertRows } from "@/lib/estimates/bom-rows";
```

- [ ] **Step 3: Update `handleFinish` in `bom-step.tsx` to skip the redundant insert**

Since BOM is now auto-persisted on generation + every edit goes through `bom-category-table.tsx` (which has its own save), `handleFinish` at `src/components/estimator/bom-step.tsx:175-196` can remove the BOM insert/delete block. Edit that block to:

```tsx
// BOM is auto-persisted by generateBom and subsequent edits; nothing to do here.
```

Leave the rooms persistence block (lines 132-173) alone.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-estimator.ts src/components/estimator/bom-step.tsx
git commit -m "feat(estimator): auto-persist BOM on generation; drop redundant insert in handleFinish"
```

---

## Task 6: Empty-state BOM card on estimate detail page

**Files:**
- Create: `src/components/estimates/empty-bom-card.tsx`
- Modify: `src/app/(app)/estimates/[id]/page.tsx:210-218,297-306`

- [ ] **Step 1: Create the card**

```tsx
// src/components/estimates/empty-bom-card.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileQuestion, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { regenerateBom } from "@/lib/estimates/regenerate-bom";

export function EmptyBomCard({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateBom(estimateId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card className="bg-gradient-card border-warning">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-txt-primary">
          <FileQuestion className="h-5 w-5 text-warning" />
          No BOM yet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-txt-secondary">
          This estimate has rooms but no bill of materials. Generate one from your
          parts database and the scraped vendor catalog.
        </p>
        <Button onClick={handleGenerate} disabled={isPending} className="bg-gradient-brand hover-lift">
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? "Generating…" : "Generate BOM"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render it in `page.tsx`**

In `src/app/(app)/estimates/[id]/page.tsx`, add the import:
```ts
import { EmptyBomCard } from "@/components/estimates/empty-bom-card";
```

Between line 295 (end of `FloorplanSchematic`) and line 298 (start of BOM tables), insert:
```tsx
{bom.length === 0 && roomList.length > 0 && (
  <EmptyBomCard estimateId={est.id} />
)}
```

- [ ] **Step 3: Dev-test**

Start dev, navigate to an estimate with rooms but no BOM rows, click "Generate BOM", confirm page refreshes with tables.

```bash
npm run dev
```
Expected: clicking the button produces BOM rows (possibly all "missing" if both equipment_catalog and vendor_products are empty, otherwise populated from vendors).

- [ ] **Step 4: Commit**

```bash
git add src/components/estimates/empty-bom-card.tsx src/app/\(app\)/estimates/\[id\]/page.tsx
git commit -m "feat(estimates): empty-state Generate BOM card on detail page"
```

---

## Task 7: Integration test — BOM generator uses classified vendor_products

**Files:**
- Create: `src/lib/hvac/__tests__/bom-generator-vendor.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { generateBOM } from "../bom-generator";
import { classifyVendorProducts } from "../vendor-classifier";
import type { VendorProductRow } from "@/types/catalog";
import type { Room } from "@/types/hvac";

function vendor(over: Partial<VendorProductRow>): VendorProductRow {
  return {
    id: crypto.randomUUID(),
    vendor_id: "v1",
    sku: "SKU",
    mpn: null,
    name: "",
    brand: "Goodman",
    image_url: null,
    short_description: null,
    category_root: "HVAC-Equipment",
    category_path: "",
    category_leaf: "",
    detail_url: null,
    price: 100,
    price_text: null,
    last_priced_at: null,
    vendor: null,
    ...over,
  };
}

function room(sqft: number): Room {
  return {
    name: "Living", type: "living_room", floor: 1, estimated_sqft: sqft,
    width_ft: 20, length_ft: 20, window_count: 2, exterior_walls: 2,
    ceiling_height: 8, notes: "", conditioned: true,
    polygon_id: "p1", vertices: [], bbox: { x: 0, y: 0, width: 100, height: 100 },
    centroid: { x: 50, y: 50 }, adjacent_rooms: [],
  };
}

describe("generateBOM with classified vendor_products", () => {
  it("fills condenser, furnace, coil, thermostat, duct, register, grille from vendors", () => {
    const catalog = classifyVendorProducts([
      vendor({
        name: "3 Ton AC Condensing Unit", mpn: "GSX160361",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
      vendor({
        name: "80K BTU Gas Furnace", mpn: "GMSS960803",
        category_path: "HVAC-Equipment/Residential-Unitary/Gas-Furnaces",
      }),
      vendor({
        name: "3 Ton Cased Evaporator Coil", mpn: "CAUF3642",
        category_path: "HVAC-Equipment/Residential-Unitary/Air-Handlers-Evaporator-Coils",
      }),
      vendor({
        name: "Honeywell T6 Pro Thermostat", brand: "Honeywell",
        category_path: "Controls/Thermostats/Thermostats/Digital-Programmable-Thermostats",
      }),
      vendor({
        name: "8x12 Sheet Metal Trunk",
        category_path: "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Ducting-Sheet-Metal",
      }),
      vendor({
        name: "4x12 Supply Register",
        category_path: "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Registers",
        category_leaf: "Registers",
      }),
      vendor({
        name: "20x25 Return Grille",
        category_path: "Supplies/Air-Distribution-Grilles-Sheet-Metal-etc-/Grilles",
        category_leaf: "Grilles",
      }),
    ]);

    const bom = generateBOM([room(1500)], "mixed", "gas_ac", catalog);
    const missingMajor = bom.items.filter(
      (i) => i.source === "missing" && ["Major Equipment", "Controls"].includes(i.category),
    );
    expect(missingMajor).toHaveLength(0);
  });

  it("prefers user catalog over vendor catalog (usage_count tie-break)", () => {
    const userItem = {
      id: "user1", user_id: "u", supplier_id: null, vendor_product_id: null,
      mpn: "USER-AC", description: "User's preferred AC",
      equipment_type: "ac_condenser" as const, system_type: "universal" as const,
      brand: "Carrier", tonnage: 3, seer_rating: null, btu_capacity: null,
      stages: null, refrigerant_type: null, unit_price: 2000,
      unit_of_measure: "ea", source: "quote" as const, usage_count: 5,
      last_quoted_date: null, created_at: "", updated_at: "",
    };
    const vendorItems = classifyVendorProducts([
      vendor({
        name: "3 Ton AC Condenser", mpn: "GSX160361",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
    ]);
    const bom = generateBOM([room(1500)], "mixed", "gas_ac", [userItem, ...vendorItems]);
    const condenser = bom.items.find((i) => i.category === "Major Equipment" && i.name.includes("preferred AC"));
    expect(condenser?.source).toBe("quote");
  });

  it("contractor brand preference picks vendor item with matching brand", () => {
    const catalog = classifyVendorProducts([
      vendor({
        name: "3 Ton AC Condenser", brand: "Goodman", mpn: "GSX160361",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
      vendor({
        name: "3 Ton AC Condenser", brand: "Carrier", mpn: "24ACC636",
        category_path: "HVAC-Equipment/Residential-Unitary/Split-Systems",
      }),
    ]);
    const bom = generateBOM(
      [room(1500)], "mixed", "gas_ac", catalog,
      undefined, undefined,
      { equipment_brands: ["Carrier"] },
    );
    const condenser = bom.items.find((i) => i.category === "Major Equipment" && i.name.includes("Condenser"));
    expect(condenser?.brand).toBe("Carrier");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/lib/hvac/__tests__/bom-generator-vendor.test.ts
```
Expected: all pass. If contractor-brand test fails, investigate whether `sortByPreference` is being applied to vendor items (it should — they flow through the same `findCatalogItem`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/hvac/__tests__/bom-generator-vendor.test.ts
git commit -m "test(hvac): BOM generator fills from classified vendor_products + respects brand prefs"
```

---

## Task 8: Manual verification

- [ ] **Step 1: Pull vendor_products into dev DB**

If dev DB is empty, restore the backup:
```bash
gunzip -c backups/vendor_catalog_2026-04-16.sql.gz | psql "$SUPABASE_DB_URL"
```
(If user already has this data in dev, skip.)

- [ ] **Step 2: Create a supplier linked to Johnstone**

In the app's Settings → Suppliers page, ensure at least one active supplier has `vendor_id` set to the Johnstone vendor row. Without this, `browseVendorProducts`-style scoping returns zero vendor products.

- [ ] **Step 3: Open `/estimates/5ff19def-33c0-4df9-97c0-776925ac79d4` and click Regenerate BOM**

Expected: the BOM now has populated equipment (condenser, furnace, coil, thermostat, registers, grilles, refrigerant, electrical, installation supplies) sourced from vendor_products (badge = "Imported"), with a small number of "missing" items only where classification genuinely fails. Brand preferences (if set in contractor preferences) should rank matching brands first.

- [ ] **Step 4: Create a new estimate, navigate through wizard to BOM step, then close the tab without clicking "Done — View Estimate". Reopen the estimate.**

Expected: BOM is already populated — survived the navigation.

- [ ] **Step 5: Delete all BOM rows for an existing estimate manually (or seed one), load the detail page.**

Expected: the `EmptyBomCard` shows. Clicking "Generate BOM" produces rows.

---

## Self-review notes

- **Spec coverage:** Task 2 handles matching (Issue 1). Tasks 5-6 handle persistence (Issue 2). Task 7 verifies contractor preferences against the vendor path. Tasks 1 and 3 are enabling infrastructure.
- **No schema changes** — vendor_products already has what we need; we classify at query time. This lets us iterate on the classifier without migrations.
- **Priority guarantees:** `equipment_catalog` items come first in the returned array, and `sortByPreference` uses `usage_count` descending as a tiebreaker. Vendor items have `usage_count: 0`, so they rank below any user item unless brand preferences promote them.
- **Contractor preferences:** they all flow through `sortByPreference` (brand, thermostat_brand) and `findCatalogItemByKeyword` (register style, grille sizing, filter size/MERV). Since the classifier preserves `brand` and packs `name + short_description` into `description`, existing preference logic in `bom-generator.ts:262-382` works unchanged against vendor items.
- **Test coverage:** classifier has 14 unit tests against real-world category paths; BOM integration has 3 tests covering vendor-only, user-preferred, and brand-preference paths.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-bom-generation-v2.md`.
