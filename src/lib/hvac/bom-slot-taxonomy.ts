import { z, type ZodTypeAny } from "zod";
import type { EquipmentType } from "@/types/catalog";

/**
 * Increment when the slot list or any per-slot spec schema changes in a way
 * that invalidates previously-classified rows. Version bumps do NOT auto-
 * trigger rescan — operators opt in via targeted SQL reset + backfill run
 * (see docs/ops/vendor-products-classifier.md).
 *
 * v2 (2026-04-16): made tonnage / btu_output nullish on major-equipment
 * slots and tightened the prompt to forbid guessing.
 *
 * v3 (2026-04-17): added mpn to the classifier input and taught the
 * prompt to decode Goodman 3-digit (036 → 3T) and Locke 2-digit
 * (48 → 4T) tonnage codes. Closes a gap where rows with tonnage only
 * in the MPN came back with null tonnage.
 */
export const CLASSIFIER_VERSION = 3;

/**
 * The full enum of BOM slots. Order is presentation-stable; grouped by how
 * they're selected:
 *   - Major equipment (Phase 2 UI: user picks from filtered candidates)
 *   - Accessories (Phase 3: AI picks based on selected major equipment)
 *
 * Keep in sync with BOM_SPEC_SCHEMAS and SLOT_TO_EQUIPMENT_TYPE below.
 */
export const BOM_SLOT_VALUES = [
  // Major equipment — user picks
  "ac_condenser",
  "heat_pump_condenser",
  "gas_furnace",
  "air_handler",
  "evap_coil",
  "heat_strips",
  "thermostat",

  // Ductwork
  "ductwork_trunk",
  "flex_duct",
  "supply_plenum",
  "return_plenum",

  // Distribution
  "supply_register",
  "return_grille",

  // Refrigerant
  "line_set",
  "refrigerant",

  // Electrical
  "disconnect",
  "conduit_whip",
  "breaker",

  // Condensate
  "condensate_pump",
  "p_trap",
  "drain_line",

  // Filtration
  "filter",

  // Installation supplies
  "duct_mastic",
  "foil_tape",
  "condenser_pad",
  "hanger_strap",
] as const;

export type BomSlot = (typeof BOM_SLOT_VALUES)[number];

const REFRIGERANT = z.enum(["r410a", "r454b", "r32", "r22", "other"]);

export const BOM_SPEC_SCHEMAS = {
  // Major-equipment tonnage/btu_output are nullish so the LLM can honestly
  // report "unknown" instead of fabricating a number to satisfy required()
  // and passing bogus specs through. Matching code tolerates null tonnage
  // and falls back to closest-match / any-match.
  ac_condenser: z.object({
    tonnage: z.number().positive().nullish(),
    seer: z.number().positive().optional(),
    eer: z.number().positive().optional(),
    refrigerant: REFRIGERANT.optional(),
    mca: z.number().positive().optional(),
    max_fuse: z.number().positive().optional(),
    liquid_size: z.string().optional(),
    suction_size: z.string().optional(),
    voltage: z.number().positive().optional(),
    phase: z.union([z.literal(1), z.literal(3)]).optional(),
    stages: z.number().int().positive().optional(),
  }),
  heat_pump_condenser: z.object({
    tonnage: z.number().positive().nullish(),
    seer: z.number().positive().optional(),
    hspf: z.number().positive().optional(),
    refrigerant: REFRIGERANT.optional(),
    mca: z.number().positive().optional(),
    max_fuse: z.number().positive().optional(),
    liquid_size: z.string().optional(),
    suction_size: z.string().optional(),
    voltage: z.number().positive().optional(),
    phase: z.union([z.literal(1), z.literal(3)]).optional(),
    stages: z.number().int().positive().optional(),
  }),
  gas_furnace: z.object({
    btu_output: z.number().positive().nullish(),
    afue: z.number().positive().optional(),
    stages: z.number().int().positive().optional(),
    blower_cfm: z.number().positive().optional(),
    filter_size: z.string().optional(),
    gas_type: z.enum(["natural", "propane", "dual"]).optional(),
    voltage: z.number().positive().optional(),
  }),
  air_handler: z.object({
    tonnage: z.number().positive().nullish(),
    cfm: z.number().positive().optional(),
    filter_size: z.string().optional(),
    voltage: z.number().positive().optional(),
    drain_size: z.string().optional(),
  }),
  evap_coil: z.object({
    tonnage: z.number().positive().nullish(),
    refrigerant: REFRIGERANT.optional(),
    cabinet_width: z.number().positive().optional(),
    drain_size: z.string().optional(),
    configuration: z.enum(["uncased", "cased", "slab"]).optional(),
  }),
  heat_strips: z.object({
    kw: z.number().positive(),
    voltage: z.number().positive().optional(),
    breaker_size: z.number().positive().optional(),
  }),
  thermostat: z.object({
    wifi: z.boolean().optional(),
    smart: z.boolean().optional(),
    stages: z.number().int().positive().optional(),
    programmable: z.boolean().optional(),
  }),
  ductwork_trunk: z.object({
    width_inches: z.number().positive(),
    height_inches: z.number().positive(),
    length_ft: z.number().positive().optional(),
    material: z.enum(["galvanized", "aluminum", "fiberboard"]).optional(),
  }),
  flex_duct: z.object({
    diameter_inches: z.number().positive(),
    length_ft: z.number().positive(),
    insulation_r: z.number().positive().optional(),
  }),
  supply_plenum: z.object({
    width_inches: z.number().positive().optional(),
    height_inches: z.number().positive().optional(),
    material: z.string().optional(),
  }),
  return_plenum: z.object({
    width_inches: z.number().positive().optional(),
    height_inches: z.number().positive().optional(),
    material: z.string().optional(),
  }),
  supply_register: z.object({
    width_inches: z.number().positive(),
    height_inches: z.number().positive(),
    style: z.enum(["sidewall", "floor", "ceiling", "diffuser"]).optional(),
  }),
  return_grille: z.object({
    width_inches: z.number().positive(),
    height_inches: z.number().positive(),
    style: z.enum(["sidewall", "floor", "ceiling"]).optional(),
  }),
  line_set: z.object({
    liquid_size: z.string(),
    suction_size: z.string(),
    length_ft: z.number().positive(),
    insulation_inches: z.number().positive().optional(),
  }),
  refrigerant: z.object({
    type: REFRIGERANT,
    weight_lb: z.number().positive(),
  }),
  disconnect: z.object({
    amps: z.number().positive(),
    fused: z.boolean(),
    voltage: z.number().positive().optional(),
  }),
  conduit_whip: z.object({
    size_inches: z.number().positive(),
    length_ft: z.number().positive(),
  }),
  breaker: z.object({
    amps: z.number().positive(),
    poles: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    voltage: z.number().positive().optional(),
  }),
  condensate_pump: z.object({
    flow_gph: z.number().positive(),
    head_ft: z.number().positive().optional(),
    voltage: z.number().positive().optional(),
  }),
  p_trap: z.object({
    size_inches: z.number().positive(),
    material: z.enum(["pvc", "copper", "steel"]).optional(),
  }),
  drain_line: z.object({
    size_inches: z.number().positive(),
    length_ft: z.number().positive(),
    material: z.enum(["pvc", "copper"]).optional(),
  }),
  filter: z.object({
    width_inches: z.number().positive(),
    height_inches: z.number().positive(),
    depth_inches: z.number().positive(),
    merv: z.number().int().positive().optional(),
  }),
  duct_mastic: z.object({
    volume: z.string(),
  }),
  foil_tape: z.object({
    width_inches: z.number().positive(),
    length_yd: z.number().positive(),
  }),
  condenser_pad: z.object({
    width_inches: z.number().positive(),
    depth_inches: z.number().positive(),
    height_inches: z.number().positive(),
    material: z.string().optional(),
  }),
  hanger_strap: z.object({
    width_inches: z.number().positive(),
    length_ft: z.number().positive(),
    material: z.enum(["galvanized", "copper", "perforated"]).optional(),
  }),
} satisfies Record<BomSlot, ZodTypeAny>;

export type BomSpecsFor<S extends BomSlot> = z.infer<(typeof BOM_SPEC_SCHEMAS)[S]>;

/**
 * Map each slot to the coarser EquipmentType the existing BOM generator uses.
 * Lets loadBomCatalog emit CatalogItem rows that the current generator can
 * still consume while Phase 2/3 are being built.
 */
export const SLOT_TO_EQUIPMENT_TYPE: Record<BomSlot, EquipmentType> = {
  ac_condenser: "ac_condenser",
  heat_pump_condenser: "heat_pump_condenser",
  gas_furnace: "gas_furnace",
  air_handler: "air_handler",
  evap_coil: "evap_coil",
  heat_strips: "heat_strips",
  thermostat: "thermostat",
  ductwork_trunk: "ductwork",
  flex_duct: "ductwork",
  supply_plenum: "ductwork",
  return_plenum: "ductwork",
  supply_register: "register",
  return_grille: "grille",
  line_set: "refrigerant",
  refrigerant: "refrigerant",
  disconnect: "electrical",
  conduit_whip: "electrical",
  breaker: "electrical",
  condensate_pump: "installation",
  p_trap: "installation",
  drain_line: "installation",
  filter: "installation",
  duct_mastic: "installation",
  foil_tape: "installation",
  condenser_pad: "installation",
  hanger_strap: "installation",
};

export function validateBomSpecs(
  slot: string,
  specs: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  if (!(BOM_SLOT_VALUES as readonly string[]).includes(slot)) {
    return { success: false, error: `Unknown slot: ${slot}` };
  }
  const schema = BOM_SPEC_SCHEMAS[slot as BomSlot];
  const parsed = schema.safeParse(specs);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, error: parsed.error.message };
}
