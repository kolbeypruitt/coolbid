import type { SystemType } from "@/types/catalog";

export type ChangeoutInstallType = {
  id: SystemType;
  label: string;
  subtitle: string;
  icon: "snowflake" | "heat-pump" | "flame" | "dual-fuel" | "zap";
};

export const CHANGEOUT_INSTALL_TYPES: readonly ChangeoutInstallType[] = [
  { id: "ac_only", label: "AC Only", subtitle: "Cooling only, no heat source", icon: "snowflake" },
  { id: "heat_pump", label: "Heat Pump", subtitle: "All-electric heat + cool", icon: "heat-pump" },
  { id: "gas_ac", label: "Gas Furnace + AC", subtitle: "Standard split system", icon: "flame" },
  { id: "dual_fuel", label: "Dual Fuel", subtitle: "Heat pump + gas backup", icon: "dual-fuel" },
  { id: "electric", label: "Air Handler + Heat Strips", subtitle: "All-electric", icon: "zap" },
] as const;
