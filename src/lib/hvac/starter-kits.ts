import type { EquipmentType, SystemType } from "@/types/catalog";

export type StarterEquipment = {
  model_number: string;
  description: string;
  equipment_type: EquipmentType;
  system_type: SystemType | "universal";
  brand: string;
  tonnage: number | null;
  seer_rating: number | null;
  btu_capacity: number | null;
  unit_price: number | null;
  unit_of_measure: string;
};

export type StarterSupplier = {
  name: string;
  brands: string[];
  equipment: StarterEquipment[];
};

// ---------------------------------------------------------------------------
// Goodman
// ---------------------------------------------------------------------------

const GOODMAN_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "GSX160241", description: "Goodman 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Goodman", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1050, unit_of_measure: "ea" },
  { model_number: "GSX160301", description: "Goodman 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Goodman", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1175, unit_of_measure: "ea" },
  { model_number: "GSX160361", description: "Goodman 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Goodman", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1325, unit_of_measure: "ea" },
  { model_number: "GSX160421", description: "Goodman 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Goodman", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1475, unit_of_measure: "ea" },
  { model_number: "GSX160481", description: "Goodman 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Goodman", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 1625, unit_of_measure: "ea" },
  { model_number: "GSX160601", description: "Goodman 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Goodman", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 1875, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "GSZB406024", description: "Goodman 2-Ton 15.2 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Goodman", tonnage: 2, seer_rating: 15, btu_capacity: 24000, unit_price: 1275, unit_of_measure: "ea" },
  { model_number: "GSZB406030", description: "Goodman 2.5-Ton 15.2 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Goodman", tonnage: 2.5, seer_rating: 15, btu_capacity: 30000, unit_price: 1425, unit_of_measure: "ea" },
  { model_number: "GSZB406036", description: "Goodman 3-Ton 15.2 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Goodman", tonnage: 3, seer_rating: 15, btu_capacity: 36000, unit_price: 1575, unit_of_measure: "ea" },
  { model_number: "GSZB406042", description: "Goodman 3.5-Ton 15.2 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Goodman", tonnage: 3.5, seer_rating: 15, btu_capacity: 42000, unit_price: 1725, unit_of_measure: "ea" },
  { model_number: "GSZB406048", description: "Goodman 4-Ton 15.2 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Goodman", tonnage: 4, seer_rating: 15, btu_capacity: 48000, unit_price: 1925, unit_of_measure: "ea" },
  { model_number: "GSZB406060", description: "Goodman 5-Ton 15.2 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Goodman", tonnage: 5, seer_rating: 15, btu_capacity: 60000, unit_price: 2250, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "AMST24BU1400", description: "Goodman 2-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Goodman", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 695, unit_of_measure: "ea" },
  { model_number: "AMST30BU1400", description: "Goodman 2.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Goodman", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 745, unit_of_measure: "ea" },
  { model_number: "AMST36BU1400", description: "Goodman 3-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Goodman", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 795, unit_of_measure: "ea" },
  { model_number: "AMST42BU1400", description: "Goodman 3.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Goodman", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 845, unit_of_measure: "ea" },
  { model_number: "AMST48BU1400", description: "Goodman 4-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Goodman", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 925, unit_of_measure: "ea" },
  { model_number: "AMST60BU1400", description: "Goodman 5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Goodman", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1075, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "CAPF3022C6", description: "Goodman 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Goodman", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 345, unit_of_measure: "ea" },
  { model_number: "CAPF3030C6", description: "Goodman 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Goodman", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 375, unit_of_measure: "ea" },
  { model_number: "CAPF3636C6", description: "Goodman 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Goodman", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 415, unit_of_measure: "ea" },
  { model_number: "CAPF4242C6", description: "Goodman 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Goodman", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 455, unit_of_measure: "ea" },
  { model_number: "CAPF4860C6", description: "Goodman 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Goodman", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 495, unit_of_measure: "ea" },
  { model_number: "CAPF6060C6", description: "Goodman 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Goodman", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 575, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "GMVC960603BN", description: "Goodman 60K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Goodman", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 1125, unit_of_measure: "ea" },
  { model_number: "GMVC960804CN", description: "Goodman 80K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Goodman", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 1245, unit_of_measure: "ea" },
  { model_number: "GMVC961005CN", description: "Goodman 100K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Goodman", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1375, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "GTHD-01", description: "Goodman/Daikin Compatible Smart Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "Goodman", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 85, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// Daikin
// ---------------------------------------------------------------------------

const DAIKIN_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "DX16SA0241", description: "Daikin 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Daikin", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1125, unit_of_measure: "ea" },
  { model_number: "DX16SA0301", description: "Daikin 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Daikin", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1275, unit_of_measure: "ea" },
  { model_number: "DX16SA0361", description: "Daikin 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Daikin", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1425, unit_of_measure: "ea" },
  { model_number: "DX16SA0421", description: "Daikin 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Daikin", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1575, unit_of_measure: "ea" },
  { model_number: "DX16SA0481", description: "Daikin 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Daikin", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 1725, unit_of_measure: "ea" },
  { model_number: "DX16SA0601", description: "Daikin 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Daikin", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 1975, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "DZ16SA0241", description: "Daikin 2-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Daikin", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1325, unit_of_measure: "ea" },
  { model_number: "DZ16SA0301", description: "Daikin 2.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Daikin", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1475, unit_of_measure: "ea" },
  { model_number: "DZ16SA0361", description: "Daikin 3-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Daikin", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1625, unit_of_measure: "ea" },
  { model_number: "DZ16SA0421", description: "Daikin 3.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Daikin", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1775, unit_of_measure: "ea" },
  { model_number: "DZ16SA0481", description: "Daikin 4-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Daikin", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 1975, unit_of_measure: "ea" },
  { model_number: "DZ16SA0601", description: "Daikin 5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Daikin", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2325, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "ARUF25B14", description: "Daikin 2-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Daikin", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 725, unit_of_measure: "ea" },
  { model_number: "ARUF31B14", description: "Daikin 2.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Daikin", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 775, unit_of_measure: "ea" },
  { model_number: "ARUF37C14", description: "Daikin 3-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Daikin", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 825, unit_of_measure: "ea" },
  { model_number: "ARUF43C14", description: "Daikin 3.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Daikin", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 875, unit_of_measure: "ea" },
  { model_number: "ARUF49C14", description: "Daikin 4-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Daikin", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 955, unit_of_measure: "ea" },
  { model_number: "ARUF61D14", description: "Daikin 5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Daikin", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1095, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "CAPF3022C6", description: "Daikin 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Daikin", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 355, unit_of_measure: "ea" },
  { model_number: "CAPF3030C6", description: "Daikin 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Daikin", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 385, unit_of_measure: "ea" },
  { model_number: "CAPF3636C6", description: "Daikin 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Daikin", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 425, unit_of_measure: "ea" },
  { model_number: "CAPF4242C6", description: "Daikin 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Daikin", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 465, unit_of_measure: "ea" },
  { model_number: "CAPF4860C6", description: "Daikin 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Daikin", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 505, unit_of_measure: "ea" },
  { model_number: "CAPF6060C6", description: "Daikin 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Daikin", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 585, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "DM96VC0603BN", description: "Daikin 60K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Daikin", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 1175, unit_of_measure: "ea" },
  { model_number: "DM96VC0804CN", description: "Daikin 80K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Daikin", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 1295, unit_of_measure: "ea" },
  { model_number: "DM96VC1005CN", description: "Daikin 100K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Daikin", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1425, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "DTHD-01", description: "Daikin One+ Smart Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "Daikin", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 195, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// Carrier
// ---------------------------------------------------------------------------

const CARRIER_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "24ACC624A003", description: "Carrier 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Carrier", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1350, unit_of_measure: "ea" },
  { model_number: "24ACC630A003", description: "Carrier 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Carrier", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1495, unit_of_measure: "ea" },
  { model_number: "24ACC636A003", description: "Carrier 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Carrier", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1650, unit_of_measure: "ea" },
  { model_number: "24ACC642A003", description: "Carrier 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Carrier", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1825, unit_of_measure: "ea" },
  { model_number: "24ACC648A003", description: "Carrier 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Carrier", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 2050, unit_of_measure: "ea" },
  { model_number: "24ACC660A003", description: "Carrier 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Carrier", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2350, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "25HPA524A003", description: "Carrier 2-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Carrier", tonnage: 2, seer_rating: 15, btu_capacity: 24000, unit_price: 1550, unit_of_measure: "ea" },
  { model_number: "25HPA530A003", description: "Carrier 2.5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Carrier", tonnage: 2.5, seer_rating: 15, btu_capacity: 30000, unit_price: 1725, unit_of_measure: "ea" },
  { model_number: "25HPA536A003", description: "Carrier 3-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Carrier", tonnage: 3, seer_rating: 15, btu_capacity: 36000, unit_price: 1895, unit_of_measure: "ea" },
  { model_number: "25HPA542A003", description: "Carrier 3.5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Carrier", tonnage: 3.5, seer_rating: 15, btu_capacity: 42000, unit_price: 2075, unit_of_measure: "ea" },
  { model_number: "25HPA548A003", description: "Carrier 4-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Carrier", tonnage: 4, seer_rating: 15, btu_capacity: 48000, unit_price: 2295, unit_of_measure: "ea" },
  { model_number: "25HPA560A003", description: "Carrier 5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Carrier", tonnage: 5, seer_rating: 15, btu_capacity: 60000, unit_price: 2650, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "FE4ANB002", description: "Carrier 2-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Carrier", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 975, unit_of_measure: "ea" },
  { model_number: "FE4ANB0025", description: "Carrier 2.5-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Carrier", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 1050, unit_of_measure: "ea" },
  { model_number: "FE4ANB003", description: "Carrier 3-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Carrier", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 1125, unit_of_measure: "ea" },
  { model_number: "FE4ANB0035", description: "Carrier 3.5-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Carrier", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 1225, unit_of_measure: "ea" },
  { model_number: "FE4ANB004", description: "Carrier 4-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Carrier", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 1350, unit_of_measure: "ea" },
  { model_number: "FE4ANB005", description: "Carrier 5-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Carrier", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1575, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "CNPVP2417ALA", description: "Carrier 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Carrier", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 425, unit_of_measure: "ea" },
  { model_number: "CNPVP3017ALA", description: "Carrier 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Carrier", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 465, unit_of_measure: "ea" },
  { model_number: "CNPVP3617ALA", description: "Carrier 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Carrier", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 505, unit_of_measure: "ea" },
  { model_number: "CNPVP4217ALA", description: "Carrier 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Carrier", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 545, unit_of_measure: "ea" },
  { model_number: "CNPVP4817ALA", description: "Carrier 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Carrier", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 595, unit_of_measure: "ea" },
  { model_number: "CNPVP6017ALA", description: "Carrier 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Carrier", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 675, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "58SC060---10", description: "Carrier 60K BTU 80% AFUE Single Stage Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Carrier", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 875, unit_of_measure: "ea" },
  { model_number: "58SC080---16", description: "Carrier 80K BTU 80% AFUE Single Stage Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Carrier", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 975, unit_of_measure: "ea" },
  { model_number: "58SC100---20", description: "Carrier 100K BTU 80% AFUE Single Stage Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Carrier", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1095, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "T6-PRO", description: "Carrier/Honeywell T6 Pro Programmable Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "Carrier", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 75, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// Bryant
// ---------------------------------------------------------------------------

const BRYANT_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "124ANA024000", description: "Bryant 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Bryant", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1295, unit_of_measure: "ea" },
  { model_number: "124ANA030000", description: "Bryant 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Bryant", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1445, unit_of_measure: "ea" },
  { model_number: "124ANA036000", description: "Bryant 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Bryant", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1595, unit_of_measure: "ea" },
  { model_number: "124ANA042000", description: "Bryant 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Bryant", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1750, unit_of_measure: "ea" },
  { model_number: "124ANA048000", description: "Bryant 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Bryant", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 1975, unit_of_measure: "ea" },
  { model_number: "124ANA060000", description: "Bryant 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Bryant", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2275, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "25HPB624A003", description: "Bryant 2-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Bryant", tonnage: 2, seer_rating: 15, btu_capacity: 24000, unit_price: 1495, unit_of_measure: "ea" },
  { model_number: "25HPB630A003", description: "Bryant 2.5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Bryant", tonnage: 2.5, seer_rating: 15, btu_capacity: 30000, unit_price: 1665, unit_of_measure: "ea" },
  { model_number: "25HPB636A003", description: "Bryant 3-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Bryant", tonnage: 3, seer_rating: 15, btu_capacity: 36000, unit_price: 1825, unit_of_measure: "ea" },
  { model_number: "25HPB642A003", description: "Bryant 3.5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Bryant", tonnage: 3.5, seer_rating: 15, btu_capacity: 42000, unit_price: 2025, unit_of_measure: "ea" },
  { model_number: "25HPB648A003", description: "Bryant 4-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Bryant", tonnage: 4, seer_rating: 15, btu_capacity: 48000, unit_price: 2225, unit_of_measure: "ea" },
  { model_number: "25HPB660A003", description: "Bryant 5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Bryant", tonnage: 5, seer_rating: 15, btu_capacity: 60000, unit_price: 2575, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "FV4CNB002", description: "Bryant 2-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Bryant", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 950, unit_of_measure: "ea" },
  { model_number: "FV4CNB0025", description: "Bryant 2.5-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Bryant", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 1025, unit_of_measure: "ea" },
  { model_number: "FV4CNB003", description: "Bryant 3-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Bryant", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 1095, unit_of_measure: "ea" },
  { model_number: "FV4CNB0035", description: "Bryant 3.5-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Bryant", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 1195, unit_of_measure: "ea" },
  { model_number: "FV4CNB004", description: "Bryant 4-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Bryant", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 1325, unit_of_measure: "ea" },
  { model_number: "FV4CNB005", description: "Bryant 5-Ton Variable Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Bryant", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1545, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "CNPVP2417BLA", description: "Bryant 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Bryant", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 415, unit_of_measure: "ea" },
  { model_number: "CNPVP3017BLA", description: "Bryant 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Bryant", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 455, unit_of_measure: "ea" },
  { model_number: "CNPVP3617BLA", description: "Bryant 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Bryant", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 495, unit_of_measure: "ea" },
  { model_number: "CNPVP4217BLA", description: "Bryant 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Bryant", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 535, unit_of_measure: "ea" },
  { model_number: "CNPVP4817BLA", description: "Bryant 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Bryant", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 585, unit_of_measure: "ea" },
  { model_number: "CNPVP6017BLA", description: "Bryant 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Bryant", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 665, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "310AAV060060", description: "Bryant 60K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Bryant", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 1095, unit_of_measure: "ea" },
  { model_number: "310AAV080100", description: "Bryant 80K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Bryant", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 1225, unit_of_measure: "ea" },
  { model_number: "310AAV100120", description: "Bryant 100K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Bryant", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1345, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "T6-PRO-B", description: "Bryant T6-Pro Programmable Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "Bryant", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 75, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// Tempstar
// ---------------------------------------------------------------------------

const TEMPSTAR_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "NXA616GKA", description: "Tempstar 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Tempstar", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1275, unit_of_measure: "ea" },
  { model_number: "NXA630GKA", description: "Tempstar 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Tempstar", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1425, unit_of_measure: "ea" },
  { model_number: "NXA636GKA", description: "Tempstar 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Tempstar", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1575, unit_of_measure: "ea" },
  { model_number: "NXA642GKA", description: "Tempstar 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Tempstar", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1725, unit_of_measure: "ea" },
  { model_number: "NXA648GKA", description: "Tempstar 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Tempstar", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 1925, unit_of_measure: "ea" },
  { model_number: "NXA660GKA", description: "Tempstar 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Tempstar", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2225, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "NXH624GKA", description: "Tempstar 2-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Tempstar", tonnage: 2, seer_rating: 15, btu_capacity: 24000, unit_price: 1475, unit_of_measure: "ea" },
  { model_number: "NXH630GKA", description: "Tempstar 2.5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Tempstar", tonnage: 2.5, seer_rating: 15, btu_capacity: 30000, unit_price: 1625, unit_of_measure: "ea" },
  { model_number: "NXH636GKA", description: "Tempstar 3-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Tempstar", tonnage: 3, seer_rating: 15, btu_capacity: 36000, unit_price: 1795, unit_of_measure: "ea" },
  { model_number: "NXH642GKA", description: "Tempstar 3.5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Tempstar", tonnage: 3.5, seer_rating: 15, btu_capacity: 42000, unit_price: 1975, unit_of_measure: "ea" },
  { model_number: "NXH648GKA", description: "Tempstar 4-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Tempstar", tonnage: 4, seer_rating: 15, btu_capacity: 48000, unit_price: 2175, unit_of_measure: "ea" },
  { model_number: "NXH660GKA", description: "Tempstar 5-Ton 15 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Tempstar", tonnage: 5, seer_rating: 15, btu_capacity: 60000, unit_price: 2525, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "ARUF25B14A", description: "Tempstar 2-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Tempstar", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 925, unit_of_measure: "ea" },
  { model_number: "ARUF31B14A", description: "Tempstar 2.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Tempstar", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 975, unit_of_measure: "ea" },
  { model_number: "ARUF37C14A", description: "Tempstar 3-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Tempstar", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 1025, unit_of_measure: "ea" },
  { model_number: "ARUF43C14A", description: "Tempstar 3.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Tempstar", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 1075, unit_of_measure: "ea" },
  { model_number: "ARUF49C14A", description: "Tempstar 4-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Tempstar", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 1175, unit_of_measure: "ea" },
  { model_number: "ARUF61D14A", description: "Tempstar 5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Tempstar", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1325, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "N8MXL0241ACA", description: "Tempstar 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Tempstar", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 405, unit_of_measure: "ea" },
  { model_number: "N8MXL0301ACA", description: "Tempstar 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Tempstar", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 445, unit_of_measure: "ea" },
  { model_number: "N8MXL0361ACA", description: "Tempstar 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Tempstar", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 485, unit_of_measure: "ea" },
  { model_number: "N8MXL0421ACA", description: "Tempstar 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Tempstar", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 525, unit_of_measure: "ea" },
  { model_number: "N8MXL0481ACA", description: "Tempstar 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Tempstar", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 575, unit_of_measure: "ea" },
  { model_number: "N8MXL0601ACA", description: "Tempstar 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Tempstar", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 655, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "N96VSN0601412A", description: "Tempstar 60K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Tempstar", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 1075, unit_of_measure: "ea" },
  { model_number: "N96VSN0801416A", description: "Tempstar 80K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Tempstar", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 1195, unit_of_measure: "ea" },
  { model_number: "N96VSN1001420A", description: "Tempstar 100K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Tempstar", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1325, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "TSTATBBPREMM01", description: "Tempstar ComfortNet Smart Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "Tempstar", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 95, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// Lennox
// ---------------------------------------------------------------------------

const LENNOX_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "EL16XC1-024", description: "Lennox 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Lennox", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1475, unit_of_measure: "ea" },
  { model_number: "EL16XC1-030", description: "Lennox 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Lennox", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1625, unit_of_measure: "ea" },
  { model_number: "EL16XC1-036", description: "Lennox 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Lennox", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1795, unit_of_measure: "ea" },
  { model_number: "EL16XC1-042", description: "Lennox 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Lennox", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1975, unit_of_measure: "ea" },
  { model_number: "EL16XC1-048", description: "Lennox 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Lennox", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 2175, unit_of_measure: "ea" },
  { model_number: "EL16XC1-060", description: "Lennox 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Lennox", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2525, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "EL16XP1-024", description: "Lennox 2-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Lennox", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1675, unit_of_measure: "ea" },
  { model_number: "EL16XP1-030", description: "Lennox 2.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Lennox", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1850, unit_of_measure: "ea" },
  { model_number: "EL16XP1-036", description: "Lennox 3-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Lennox", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 2025, unit_of_measure: "ea" },
  { model_number: "EL16XP1-042", description: "Lennox 3.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Lennox", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 2225, unit_of_measure: "ea" },
  { model_number: "EL16XP1-048", description: "Lennox 4-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Lennox", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 2475, unit_of_measure: "ea" },
  { model_number: "EL16XP1-060", description: "Lennox 5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Lennox", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2875, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "CBX25UH-024", description: "Lennox 2-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Lennox", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 1075, unit_of_measure: "ea" },
  { model_number: "CBX25UH-030", description: "Lennox 2.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Lennox", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 1150, unit_of_measure: "ea" },
  { model_number: "CBX25UH-036", description: "Lennox 3-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Lennox", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 1225, unit_of_measure: "ea" },
  { model_number: "CBX25UH-042", description: "Lennox 3.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Lennox", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 1325, unit_of_measure: "ea" },
  { model_number: "CBX25UH-048", description: "Lennox 4-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Lennox", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 1450, unit_of_measure: "ea" },
  { model_number: "CBX25UH-060", description: "Lennox 5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Lennox", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1675, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "C33-24A-2F", description: "Lennox 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Lennox", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 475, unit_of_measure: "ea" },
  { model_number: "C33-30A-2F", description: "Lennox 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Lennox", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 515, unit_of_measure: "ea" },
  { model_number: "C33-36A-2F", description: "Lennox 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Lennox", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 555, unit_of_measure: "ea" },
  { model_number: "C33-42A-2F", description: "Lennox 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Lennox", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 595, unit_of_measure: "ea" },
  { model_number: "C33-48A-2F", description: "Lennox 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Lennox", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 645, unit_of_measure: "ea" },
  { model_number: "C33-60A-2F", description: "Lennox 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Lennox", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 725, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "EL296UH060XE36B", description: "Lennox 60K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Lennox", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 1350, unit_of_measure: "ea" },
  { model_number: "EL296UH080XE48B", description: "Lennox 80K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Lennox", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 1495, unit_of_measure: "ea" },
  { model_number: "EL296UH100XE60C", description: "Lennox 100K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Lennox", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1650, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "S30", description: "Lennox S30 Smart Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "Lennox", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 175, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// Rheem
// ---------------------------------------------------------------------------

const RHEEM_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "RA1624AJ1NA", description: "Rheem 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Rheem", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1225, unit_of_measure: "ea" },
  { model_number: "RA1630AJ1NA", description: "Rheem 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Rheem", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1375, unit_of_measure: "ea" },
  { model_number: "RA1636AJ1NA", description: "Rheem 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Rheem", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1525, unit_of_measure: "ea" },
  { model_number: "RA1642AJ1NA", description: "Rheem 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Rheem", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1675, unit_of_measure: "ea" },
  { model_number: "RA1648AJ1NA", description: "Rheem 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Rheem", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 1875, unit_of_measure: "ea" },
  { model_number: "RA1660AJ1NA", description: "Rheem 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Rheem", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2175, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "RP1624AJ1NA", description: "Rheem 2-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Rheem", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1425, unit_of_measure: "ea" },
  { model_number: "RP1630AJ1NA", description: "Rheem 2.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Rheem", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1595, unit_of_measure: "ea" },
  { model_number: "RP1636AJ1NA", description: "Rheem 3-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Rheem", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1765, unit_of_measure: "ea" },
  { model_number: "RP1642AJ1NA", description: "Rheem 3.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Rheem", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1945, unit_of_measure: "ea" },
  { model_number: "RP1648AJ1NA", description: "Rheem 4-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Rheem", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 2145, unit_of_measure: "ea" },
  { model_number: "RP1660AJ1NA", description: "Rheem 5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Rheem", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2495, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "RH1T2417STANJA", description: "Rheem 2-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Rheem", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 875, unit_of_measure: "ea" },
  { model_number: "RH1T3017STANJA", description: "Rheem 2.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Rheem", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 945, unit_of_measure: "ea" },
  { model_number: "RH1T3617STANJA", description: "Rheem 3-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Rheem", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 1015, unit_of_measure: "ea" },
  { model_number: "RH1T4221STANJA", description: "Rheem 3.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Rheem", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 1095, unit_of_measure: "ea" },
  { model_number: "RH1T4821STANJA", description: "Rheem 4-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Rheem", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 1195, unit_of_measure: "ea" },
  { model_number: "RH1T6021STANJA", description: "Rheem 5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Rheem", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1395, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "RC8024EFAUMA", description: "Rheem 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Rheem", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 375, unit_of_measure: "ea" },
  { model_number: "RC8030EFAUMA", description: "Rheem 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Rheem", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 415, unit_of_measure: "ea" },
  { model_number: "RC8036EFAUMA", description: "Rheem 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Rheem", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 455, unit_of_measure: "ea" },
  { model_number: "RC8042EFAUMA", description: "Rheem 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Rheem", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 495, unit_of_measure: "ea" },
  { model_number: "RC8048EFAUMA", description: "Rheem 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Rheem", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 545, unit_of_measure: "ea" },
  { model_number: "RC8060EFAUMA", description: "Rheem 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Rheem", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 625, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "R96VA0601317MSA", description: "Rheem 60K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Rheem", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 1150, unit_of_measure: "ea" },
  { model_number: "R96VA0801317MSA", description: "Rheem 80K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Rheem", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 1275, unit_of_measure: "ea" },
  { model_number: "R96VA1001521MSA", description: "Rheem 100K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Rheem", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1395, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "RTH9585WF1004", description: "Rheem/Honeywell WiFi Smart Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "Rheem", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 95, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// Ruud
// ---------------------------------------------------------------------------

const RUUD_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "UA16AZ024", description: "Ruud 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Ruud", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1225, unit_of_measure: "ea" },
  { model_number: "UA16AZ030", description: "Ruud 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Ruud", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1375, unit_of_measure: "ea" },
  { model_number: "UA16AZ036", description: "Ruud 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Ruud", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1525, unit_of_measure: "ea" },
  { model_number: "UA16AZ042", description: "Ruud 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Ruud", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1675, unit_of_measure: "ea" },
  { model_number: "UA16AZ048", description: "Ruud 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Ruud", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 1875, unit_of_measure: "ea" },
  { model_number: "UA16AZ060", description: "Ruud 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "Ruud", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2175, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "UP16AZ024", description: "Ruud 2-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Ruud", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1425, unit_of_measure: "ea" },
  { model_number: "UP16AZ030", description: "Ruud 2.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Ruud", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1595, unit_of_measure: "ea" },
  { model_number: "UP16AZ036", description: "Ruud 3-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Ruud", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1765, unit_of_measure: "ea" },
  { model_number: "UP16AZ042", description: "Ruud 3.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Ruud", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1945, unit_of_measure: "ea" },
  { model_number: "UP16AZ048", description: "Ruud 4-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Ruud", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 2145, unit_of_measure: "ea" },
  { model_number: "UP16AZ060", description: "Ruud 5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "Ruud", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2495, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "RH2T2417STANJA", description: "Ruud 2-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Ruud", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 875, unit_of_measure: "ea" },
  { model_number: "RH2T3017STANJA", description: "Ruud 2.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Ruud", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 945, unit_of_measure: "ea" },
  { model_number: "RH2T3617STANJA", description: "Ruud 3-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Ruud", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 1015, unit_of_measure: "ea" },
  { model_number: "RH2T4221STANJA", description: "Ruud 3.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Ruud", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 1095, unit_of_measure: "ea" },
  { model_number: "RH2T4821STANJA", description: "Ruud 4-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Ruud", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 1195, unit_of_measure: "ea" },
  { model_number: "RH2T6021STANJA", description: "Ruud 5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "Ruud", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1395, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "RC10024EFAUMA", description: "Ruud 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Ruud", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 375, unit_of_measure: "ea" },
  { model_number: "RC10030EFAUMA", description: "Ruud 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Ruud", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 415, unit_of_measure: "ea" },
  { model_number: "RC10036EFAUMA", description: "Ruud 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Ruud", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 455, unit_of_measure: "ea" },
  { model_number: "RC10042EFAUMA", description: "Ruud 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Ruud", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 495, unit_of_measure: "ea" },
  { model_number: "RC10048EFAUMA", description: "Ruud 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Ruud", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 545, unit_of_measure: "ea" },
  { model_number: "RC10060EFAUMA", description: "Ruud 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "Ruud", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 625, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "R96VA0601317MSA-R", description: "Ruud 60K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Ruud", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 1150, unit_of_measure: "ea" },
  { model_number: "R96VA0801317MSA-R", description: "Ruud 80K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Ruud", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 1275, unit_of_measure: "ea" },
  { model_number: "R96VA1001521MSA-R", description: "Ruud 100K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "Ruud", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1395, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "RTH9585WF-R", description: "Ruud WiFi Smart Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "Ruud", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 95, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// York
// ---------------------------------------------------------------------------

const YORK_EQUIPMENT: StarterEquipment[] = [
  // AC Condensers
  { model_number: "YCD24B21S", description: "York 2-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "York", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1250, unit_of_measure: "ea" },
  { model_number: "YCD30B21S", description: "York 2.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "York", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1395, unit_of_measure: "ea" },
  { model_number: "YCD36B21S", description: "York 3-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "York", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1545, unit_of_measure: "ea" },
  { model_number: "YCD42B21S", description: "York 3.5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "York", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1695, unit_of_measure: "ea" },
  { model_number: "YCD48B21S", description: "York 4-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "York", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 1895, unit_of_measure: "ea" },
  { model_number: "YCD60B21S", description: "York 5-Ton 16 SEER2 AC Condenser", equipment_type: "ac_condenser", system_type: "gas_ac", brand: "York", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2195, unit_of_measure: "ea" },
  // Heat Pump Condensers
  { model_number: "YZH24B21S", description: "York 2-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "York", tonnage: 2, seer_rating: 16, btu_capacity: 24000, unit_price: 1450, unit_of_measure: "ea" },
  { model_number: "YZH30B21S", description: "York 2.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "York", tonnage: 2.5, seer_rating: 16, btu_capacity: 30000, unit_price: 1625, unit_of_measure: "ea" },
  { model_number: "YZH36B21S", description: "York 3-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "York", tonnage: 3, seer_rating: 16, btu_capacity: 36000, unit_price: 1795, unit_of_measure: "ea" },
  { model_number: "YZH42B21S", description: "York 3.5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "York", tonnage: 3.5, seer_rating: 16, btu_capacity: 42000, unit_price: 1975, unit_of_measure: "ea" },
  { model_number: "YZH48B21S", description: "York 4-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "York", tonnage: 4, seer_rating: 16, btu_capacity: 48000, unit_price: 2175, unit_of_measure: "ea" },
  { model_number: "YZH60B21S", description: "York 5-Ton 16 SEER2 Heat Pump Condenser", equipment_type: "heat_pump_condenser", system_type: "heat_pump", brand: "York", tonnage: 5, seer_rating: 16, btu_capacity: 60000, unit_price: 2525, unit_of_measure: "ea" },
  // Air Handlers
  { model_number: "AHF24B3XH21", description: "York 2-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "York", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 895, unit_of_measure: "ea" },
  { model_number: "AHF30B3XH21", description: "York 2.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "York", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 965, unit_of_measure: "ea" },
  { model_number: "AHF36C3XH21", description: "York 3-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "York", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 1035, unit_of_measure: "ea" },
  { model_number: "AHF42C3XH21", description: "York 3.5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "York", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 1115, unit_of_measure: "ea" },
  { model_number: "AHF48C3XH21", description: "York 4-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "York", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 1215, unit_of_measure: "ea" },
  { model_number: "AHF60D3XH21", description: "York 5-Ton Multi-Speed Air Handler", equipment_type: "air_handler", system_type: "universal", brand: "York", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 1415, unit_of_measure: "ea" },
  // Evaporator Coils
  { model_number: "YCJF24B21", description: "York 2-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "York", tonnage: 2, seer_rating: null, btu_capacity: 24000, unit_price: 385, unit_of_measure: "ea" },
  { model_number: "YCJF30B21", description: "York 2.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "York", tonnage: 2.5, seer_rating: null, btu_capacity: 30000, unit_price: 425, unit_of_measure: "ea" },
  { model_number: "YCJF36B21", description: "York 3-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "York", tonnage: 3, seer_rating: null, btu_capacity: 36000, unit_price: 465, unit_of_measure: "ea" },
  { model_number: "YCJF42B21", description: "York 3.5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "York", tonnage: 3.5, seer_rating: null, btu_capacity: 42000, unit_price: 505, unit_of_measure: "ea" },
  { model_number: "YCJF48B21", description: "York 4-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "York", tonnage: 4, seer_rating: null, btu_capacity: 48000, unit_price: 555, unit_of_measure: "ea" },
  { model_number: "YCJF60B21", description: "York 5-Ton Cased Evaporator Coil", equipment_type: "evap_coil", system_type: "gas_ac", brand: "York", tonnage: 5, seer_rating: null, btu_capacity: 60000, unit_price: 635, unit_of_measure: "ea" },
  // Gas Furnaces
  { model_number: "TM9V060B12MP11", description: "York 60K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "York", tonnage: null, seer_rating: null, btu_capacity: 60000, unit_price: 1125, unit_of_measure: "ea" },
  { model_number: "TM9V080C16MP11", description: "York 80K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "York", tonnage: null, seer_rating: null, btu_capacity: 80000, unit_price: 1245, unit_of_measure: "ea" },
  { model_number: "TM9V100C20MP11", description: "York 100K BTU 96% AFUE 2-Stage Variable Speed Furnace", equipment_type: "gas_furnace", system_type: "gas_ac", brand: "York", tonnage: null, seer_rating: null, btu_capacity: 100000, unit_price: 1375, unit_of_measure: "ea" },
  // Thermostat
  { model_number: "TSTATBBPREMM01-Y", description: "York Residential Programmable Thermostat", equipment_type: "thermostat", system_type: "universal", brand: "York", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 85, unit_of_measure: "ea" },
];

// ---------------------------------------------------------------------------
// Supplier definitions
// ---------------------------------------------------------------------------

export const STARTER_SUPPLIERS: StarterSupplier[] = [
  {
    name: "Johnstone Supply",
    brands: ["Goodman", "Daikin"],
    equipment: [...GOODMAN_EQUIPMENT, ...DAIKIN_EQUIPMENT],
  },
  {
    name: "Sanders Supply",
    brands: ["Carrier", "Bryant", "Tempstar"],
    equipment: [...CARRIER_EQUIPMENT, ...BRYANT_EQUIPMENT, ...TEMPSTAR_EQUIPMENT],
  },
  {
    name: "Shearer Supply",
    brands: ["Lennox"],
    equipment: [...LENNOX_EQUIPMENT],
  },
  {
    name: "Locke Supply",
    brands: ["Goodman", "Rheem", "Ruud"],
    equipment: [...GOODMAN_EQUIPMENT, ...RHEEM_EQUIPMENT, ...RUUD_EQUIPMENT],
  },
  {
    name: "Amsco Supply",
    brands: ["Rheem", "Ruud", "York"],
    equipment: [...RHEEM_EQUIPMENT, ...RUUD_EQUIPMENT, ...YORK_EQUIPMENT],
  },
];

// ---------------------------------------------------------------------------
// Universal items — converted from non-equipment entries in PARTS_DB
// ---------------------------------------------------------------------------

export const UNIVERSAL_STARTER_ITEMS: StarterEquipment[] = [
  // Ductwork
  { model_number: "SM0812", description: '8"x12" Sheet Metal Trunk', equipment_type: "ductwork", system_type: "universal", brand: "Local Sheet Metal", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 12.50, unit_of_measure: "ft" },
  { model_number: "SM1014", description: '10"x14" Sheet Metal Trunk', equipment_type: "ductwork", system_type: "universal", brand: "Local Sheet Metal", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 15.75, unit_of_measure: "ft" },
  { model_number: "SM1216", description: '12"x16" Sheet Metal Trunk', equipment_type: "ductwork", system_type: "universal", brand: "Local Sheet Metal", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 18.50, unit_of_measure: "ft" },
  { model_number: "FD06", description: '6" Round Flex Duct', equipment_type: "ductwork", system_type: "universal", brand: "Hart & Cooley", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 2.85, unit_of_measure: "ft" },
  { model_number: "FD08", description: '8" Round Flex Duct', equipment_type: "ductwork", system_type: "universal", brand: "Hart & Cooley", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 3.45, unit_of_measure: "ft" },
  { model_number: "FD10", description: '10" Round Flex Duct', equipment_type: "ductwork", system_type: "universal", brand: "Hart & Cooley", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 4.25, unit_of_measure: "ft" },
  { model_number: "PL-SUP", description: "Supply Plenum", equipment_type: "ductwork", system_type: "universal", brand: "Local Sheet Metal", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 145, unit_of_measure: "ea" },
  { model_number: "PL-RET", description: "Return Plenum", equipment_type: "ductwork", system_type: "universal", brand: "Local Sheet Metal", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 165, unit_of_measure: "ea" },
  // Registers & Grilles
  { model_number: "421-4x12W", description: '4"x12" Supply Register', equipment_type: "register", system_type: "universal", brand: "Hart & Cooley", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 9.75, unit_of_measure: "ea" },
  { model_number: "421-6x12W", description: '6"x12" Supply Register', equipment_type: "register", system_type: "universal", brand: "Hart & Cooley", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 12.50, unit_of_measure: "ea" },
  { model_number: "RG-2025W", description: '20"x25" Return Grille', equipment_type: "grille", system_type: "universal", brand: "Hart & Cooley", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 22.50, unit_of_measure: "ea" },
  { model_number: "RG-2030W", description: '20"x30" Return Grille', equipment_type: "grille", system_type: "universal", brand: "Hart & Cooley", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 28, unit_of_measure: "ea" },
  { model_number: "RG-2430W", description: '24"x30" Return Grille', equipment_type: "grille", system_type: "universal", brand: "Hart & Cooley", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 34, unit_of_measure: "ea" },
  // Refrigerant & Lines
  { model_number: "LS-3825", description: '3/8"x3/4" Line Set (25ft)', equipment_type: "refrigerant", system_type: "universal", brand: "Mueller", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 85, unit_of_measure: "ea" },
  { model_number: "LS-3850", description: '3/8"x3/4" Line Set (50ft)', equipment_type: "refrigerant", system_type: "universal", brand: "Mueller", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 145, unit_of_measure: "ea" },
  { model_number: "R410A-25", description: "R-410A Refrigerant (25lb)", equipment_type: "refrigerant", system_type: "universal", brand: "National", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 185, unit_of_measure: "ea" },
  // Electrical
  { model_number: "DPU222R", description: "60A Non-Fused Disconnect", equipment_type: "electrical", system_type: "universal", brand: "Eaton", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 32, unit_of_measure: "ea" },
  { model_number: "55189407", description: '3/4" Conduit Whip (6ft)', equipment_type: "electrical", system_type: "universal", brand: "Southwire", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 18, unit_of_measure: "ea" },
  { model_number: "HOM230CP", description: "30A Dbl-Pole Breaker", equipment_type: "electrical", system_type: "universal", brand: "Square D", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 12, unit_of_measure: "ea" },
  { model_number: "HOM240CP", description: "40A Dbl-Pole Breaker", equipment_type: "electrical", system_type: "universal", brand: "Square D", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 14, unit_of_measure: "ea" },
  { model_number: "HOM250CP", description: "50A Dbl-Pole Breaker", equipment_type: "electrical", system_type: "universal", brand: "Square D", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 16, unit_of_measure: "ea" },
  // Installation
  { model_number: "554405", description: "Condensate Pump", equipment_type: "installation", system_type: "universal", brand: "Little Giant", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 65, unit_of_measure: "ea" },
  { model_number: "PVC00700", description: 'P-Trap (3/4" PVC)', equipment_type: "installation", system_type: "universal", brand: "Charlotte Pipe", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 4.50, unit_of_measure: "ea" },
  { model_number: "PVC07010", description: '3/4" PVC Drain Line (10ft)', equipment_type: "installation", system_type: "universal", brand: "Charlotte Pipe", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 8.50, unit_of_measure: "ea" },
  { model_number: "F16251", description: "16x25x1 Filter (MERV 8)", equipment_type: "installation", system_type: "universal", brand: "Filtrete", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 6.50, unit_of_measure: "ea" },
  { model_number: "F20251", description: "20x25x1 Filter (MERV 8)", equipment_type: "installation", system_type: "universal", brand: "Filtrete", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 7.50, unit_of_measure: "ea" },
  { model_number: "304133", description: "Duct Mastic (1 Gal)", equipment_type: "installation", system_type: "universal", brand: "Hardcast", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 14.50, unit_of_measure: "ea" },
  { model_number: "322", description: 'Foil Tape (2.5"x60yd)', equipment_type: "installation", system_type: "universal", brand: "Nashua", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 12.50, unit_of_measure: "ea" },
  { model_number: "EL2424-3", description: "Condenser Pad (24x24x3)", equipment_type: "installation", system_type: "universal", brand: "DiversiTech", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 38, unit_of_measure: "ea" },
  { model_number: "33528", description: "Hanger Strap (100ft)", equipment_type: "installation", system_type: "universal", brand: "Oatey", tonnage: null, seer_rating: null, btu_capacity: null, unit_price: 22, unit_of_measure: "ea" },
];
