export const EQUIPMENT_BRANDS = [
  "Carrier",
  "Trane",
  "Lennox",
  "Goodman",
  "Daikin",
  "Rheem",
  "American Standard",
  "York",
  "Bryant",
  "Heil",
] as const;

export const SUPPLY_REGISTER_STYLES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "rectangular_4x12", label: "4x12 rectangular" },
  { value: "rectangular_6x10", label: "6x10 rectangular" },
  { value: "square_flush_ceiling", label: "Square flush-mount ceiling" },
  { value: "round_ceiling_diffuser", label: "Round ceiling diffuser" },
  { value: "floor_register", label: "Floor register" },
  { value: "other", label: "Other (describe in notes)" },
];

export const RETURN_GRILLE_SIZINGS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "standard_20x20", label: "Standard 20x20" },
  { value: "oversized_24x24", label: "Oversized 24x24" },
  { value: "multiple_small", label: "Multiple smaller returns per zone" },
  { value: "other", label: "Other (describe in notes)" },
];

export const DUCT_TRUNK_MATERIALS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "sheet_metal", label: "Sheet metal" },
  { value: "duct_board", label: "Duct board" },
  { value: "flex", label: "Flex duct trunk" },
];

export const FILTER_SIZES = [
  "14x20x1",
  "16x20x1",
  "16x25x1",
  "20x20x1",
  "20x25x1",
  "16x25x4",
  "20x25x4",
] as const;

export const FILTER_MERV_RATINGS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "8", label: "MERV 8" },
  { value: "11", label: "MERV 11" },
  { value: "13", label: "MERV 13" },
  { value: "16", label: "MERV 16" },
];

export const THERMOSTAT_BRANDS = [
  "Honeywell",
  "Ecobee",
  "Google Nest",
  "Sensi",
  "Emerson",
  "Carrier",
  "Trane",
] as const;
