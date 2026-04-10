# Estimate Editing — Design Spec

## Problem

After an estimate is saved from the wizard, there is no way to modify it. Users cannot adjust margin %, swap parts, delete items, or add new parts from the catalog. The only option is to start over.

## Solution

Turn the existing estimate detail page (`estimates/[id]`) into an inline editing surface. All changes auto-save and recalculate totals in real-time.

---

## 1. Financials Card

Replace the four static summary cards (Materials, Labor, Margin, Total) with a single interactive `FinancialsCard` client component.

- **Margin slider** — range input (0–100%) with a number input beside it for precise entry. Dragging or typing recalculates the total price in real-time.
- **Labor rate** (`$/hr`) and **labor hours** — editable number inputs.
- **Live totals** — Materials, Labor, Markup amount ($), and Total Price all recalculate instantly as any input changes.
- **Auto-save** — debounced (500ms) server action call to persist changes. No explicit save button.

### Pricing formula (unchanged from wizard)

```
materialCost = sum of (bom_items.unit_cost * bom_items.quantity)
laborCost    = laborRate * laborHours
subtotal     = materialCost + laborCost
markup       = subtotal * (profitMargin / 100)
totalPrice   = subtotal + markup
```

---

## 2. BOM Table Actions

Each BOM category card keeps its grouped layout but becomes interactive via `BomCategoryTable` client components.

### Row actions (per item)

| Action | Behavior |
|--------|----------|
| **Edit quantity** | Inline editable number field. Recalculates `total_cost = quantity * unit_cost`. |
| **Edit unit cost** | Inline editable number field. Sets `source` to `"manual"`. Recalculates `total_cost`. |
| **Delete** | Confirmation prompt, then removes the `estimate_bom_items` row. |
| **Swap** | Opens `CatalogSearchDialog` filtered to the same category. Replaces the item with the selected catalog part, keeping the current quantity. |

### Add Part

An "Add Part" button (per category section or global) opens an `AddPartDialog`:

- **Catalog search** — searches `equipment_catalog` by description, model number, SKU, or equipment type. Results show price, tonnage, brand.
- **Custom item fallback** — if no catalog match, user can manually enter description, unit cost, quantity, and category. Saved with `source: "manual"`. Does NOT write to `equipment_catalog`.
- Default quantity: 1.

### Auto-save

Each edit, delete, swap, or add is its own server action call. No batch save.

---

## 3. Status & Share Interaction

When editing a **sent** estimate:

- The first mutation flips status back to `"draft"`.
- The existing share link remains but shows stale data (homeowner sees the old version).
- An `UnsavedShareBanner` appears at the top of the detail page: "You've made changes since this was last shared" with a quick action to re-share.
- Re-sharing generates a new share token and flips status back to `"sent"`.

---

## 4. Architecture

### Page structure

The detail page remains a **server component** for the initial data fetch. Interactive pieces are client components receiving server data as props.

| Component | Type | Responsibility |
|-----------|------|---------------|
| `estimates/[id]/page.tsx` | Server | Fetches estimate, rooms, BOM items, share state. Passes data to client components. |
| `FinancialsCard` | Client | Margin slider, labor inputs, live recalculation, debounced save. |
| `BomCategoryTable` | Client | Renders one category's BOM items with inline edit, delete, swap row actions. |
| `AddPartDialog` | Client | Catalog search + custom item form for adding new parts. |
| `CatalogSearchDialog` | Client | Shared search UI used by both "swap" and "add" flows. |
| `UnsavedShareBanner` | Client | Banner shown when a sent estimate has unsaved changes. |

### Server actions

Located in a dedicated actions file (`src/app/(app)/estimates/[id]/actions.ts`):

| Action | Parameters | Behavior |
|--------|-----------|----------|
| `updateFinancials` | `estimateId, { profitMargin, laborRate, laborHours }` | Updates estimate row, recalculates `total_material_cost` and `total_price`. Flips status to "draft" if "sent". |
| `updateBomItem` | `itemId, { quantity?, unitCost? }` | Updates item row and `total_cost`. Recalculates estimate totals. Flips status if "sent". |
| `deleteBomItem` | `itemId` | Deletes item row. Recalculates estimate totals. Flips status if "sent". |
| `swapBomItem` | `itemId, catalogItemId` | Replaces item with catalog part (keeps quantity). Recalculates totals. Flips status if "sent". |
| `addBomItem` | `estimateId, { catalogItemId?, description?, unitCost?, quantity, category }` | Inserts new `estimate_bom_items` row. Recalculates totals. Flips status if "sent". |
| `searchCatalog` | `query, filters?` | Searches `equipment_catalog` table. Returns matching items. |

### Recalculation on every mutation

Every mutation that changes pricing (all except `searchCatalog`) recalculates:

1. `total_material_cost` = sum of all BOM item `total_cost` values
2. `total_price` = `(total_material_cost + laborCost) * (1 + profitMargin/100)`
3. Updates the `estimates` row with new totals

---

## 5. Out of Scope

- Room editing on the detail page (rooms remain read-only)
- Re-running the BOM generator from the detail page
- Writing manual/custom items back to `equipment_catalog`
- Undo/redo for edits
