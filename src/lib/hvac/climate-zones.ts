import type { ClimateZone, ClimateZoneKey } from "@/types/hvac";

export const CLIMATE_ZONES: Record<ClimateZoneKey, ClimateZone> = {
  hot_humid: {
    label: "Hot & Humid (FL, TX Gulf, LA, MS, AL, GA)",
    factor: 1.2,
    desc: "High cooling loads year-round with significant latent heat from humidity",
  },
  hot_dry: {
    label: "Hot & Dry (AZ, NV, NM, inland CA)",
    factor: 1.15,
    desc: "High sensible cooling loads with low humidity; large diurnal swings",
  },
  warm: {
    label: "Warm (TX central, OK, AR, SC, NC, VA)",
    factor: 1.0,
    desc: "Moderate to high cooling loads; mild winters with some heating required",
  },
  mixed: {
    label: "Mixed (TN, KY, MO, KS, CO, UT, OR coast)",
    factor: 0.95,
    desc: "Balanced heating and cooling loads; four distinct seasons",
  },
  cool: {
    label: "Cool (IL, IN, OH, PA, NY, NJ, WA)",
    factor: 0.85,
    desc: "Heating-dominant; moderate cooling loads in summer",
  },
  cold: {
    label: "Cold (MN, WI, MI, ND, SD, MT, WY, ME)",
    factor: 0.8,
    desc: "Heavy heating loads; minimal cooling season",
  },
};
