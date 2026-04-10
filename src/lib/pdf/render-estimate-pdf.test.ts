import { describe, it, expect } from "vitest";
import { PDFParse } from "pdf-parse";
import { renderEstimatePdf } from "./render-estimate-pdf";

async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  const parser = new PDFParse({ data: buffer });
  return parser.getText();
}
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "u1",
    company_name: "Greenfield Heating & Air",
    company_email: "contact@greenfieldhvac.com",
    company_phone: "(918) 555-0100",
    address: "123 Main St",
    state: "OK",
    zip: "74824",
    stripe_customer_id: null,
    subscription_tier: "pro",
    subscription_status: "active",
    trial_ends_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-04-09T00:00:00Z",
    onboarding_completed: true,
    ai_actions_used: 0,
    stripe_subscription_id: null,
    subscription_period_end: null,
    referral_source: null,
    referral_code: null,
    default_display_mode: "total_only",
    default_quote_validity_days: 30,
    logo_url: null,
    logo_content_type: null,
    ...overrides,
  };
}

function estimate(overrides: Partial<EstimateRow> = {}): EstimateRow {
  return {
    id: "e1",
    user_id: "u1",
    project_name: "Doe Residence",
    customer_name: "Jane Doe",
    status: "draft",
    total_sqft: 1820,
    num_units: 1,
    hvac_per_unit: false,
    climate_zone: "3A",
    profit_margin: 25,
    labor_rate: 85,
    labor_hours: 16,
    supplier_name: "",
    total_material_cost: 6000,
    total_price: 9096,
    system_type: "heat_pump",
    created_at: "2026-04-09T00:00:00Z",
    updated_at: "2026-04-09T00:00:00Z",
    job_address: "456 Elm St, Agra OK 74824",
    customer_email: "jane@example.com",
    customer_phone: null,
    note_to_customer: null,
    valid_until: "2026-05-09",
    display_mode: "total_only",
    scope_of_work: null,
    ...overrides,
  };
}

const rooms: RoomRow[] = [];

const bom: BomRow[] = [
  {
    id: "b1",
    estimate_id: "e1",
    category: "equipment",
    description: "3.5-ton heat pump, 16 SEER2",
    quantity: 1,
    unit: "ea",
    unit_cost: 4280,
    total_cost: 4280,
    part_id: null,
    supplier: null,
    sku: null,
    notes: "",
    source: "catalog",
    room_id: null,
    created_at: "2026-04-09T00:00:00Z",
  },
];

describe("renderEstimatePdf", () => {
  it("produces a non-empty PDF buffer with customer and total text", async () => {
    const buffer = await renderEstimatePdf({
      estimate: estimate(),
      profile: profile(),
      rooms,
      bom,
      logoBuffer: null,
    });

    expect(buffer.length).toBeGreaterThan(1000);

    const parsed = await parsePdf(buffer);
    expect(parsed.text).toContain("Greenfield Heating & Air");
    expect(parsed.text).toContain("Jane Doe");
    expect(parsed.text).toContain("$9,096.00");
    expect(parsed.text).toContain("heat pump");
    // total_only mode — no itemized BOM description
    expect(parsed.text).not.toContain("3.5-ton heat pump, 16 SEER2");
  }, 30_000);

  it("includes BOM lines in itemized mode", async () => {
    const buffer = await renderEstimatePdf({
      estimate: estimate({ display_mode: "itemized" }),
      profile: profile(),
      rooms,
      bom,
      logoBuffer: null,
    });

    const parsed = await parsePdf(buffer);
    expect(parsed.text).toContain("3.5-ton heat pump, 16 SEER2");
    expect(parsed.text).toContain("$4,280.00");
  }, 30_000);
});
