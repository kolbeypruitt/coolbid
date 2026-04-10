import { create } from "zustand";
import type { AnalysisResult, BomResult, ClimateZoneKey, Room } from "@/types/hvac";
import type { SystemType } from "@/types/catalog";
import { generateBOM } from "@/lib/hvac/bom-generator";
import { createClient } from "@/lib/supabase/client";

type EstimatorStep = "customer" | "upload" | "select_pages" | "analyzing" | "rooms" | "bom";

type PagePreview = {
  pageNum: number;
  previewUrl: string;
  base64: string;
  mediaType: string;
};

type EstimatorState = {
  step: EstimatorStep;
  fileName: string;
  floorplanImg: string | null;
  pdfPages: PagePreview[];
  selectedPages: number[];
  knownTotalSqft: string;
  knownUnits: number;
  hvacPerUnit: boolean;
  climateZone: ClimateZoneKey;
  systemType: SystemType;
  analysisProgress: number;
  analysisResult: AnalysisResult | null;
  rooms: Room[];
  bom: BomResult | null;
  profitMargin: number;
  laborRate: number;
  laborHours: number;
  projectName: string;
  customerName: string;
  jobAddress: string;
  customerEmail: string;
  customerPhone: string;
  supplierName: string;
  error: string | null;
  showRFQ: boolean;
};

type EstimatorActions = {
  setStep: (step: EstimatorStep) => void;
  setFile: (fileName: string, img: string) => void;
  setPdfPages: (pages: PagePreview[]) => void;
  setSelectedPages: (pages: number[]) => void;
  setBuildingInfo: (info: Partial<Pick<EstimatorState, "knownTotalSqft" | "knownUnits" | "hvacPerUnit" | "climateZone" | "systemType">>) => void;
  setAnalysisProgress: (progress: number) => void;
  setAnalysisResult: (result: AnalysisResult) => void;
  setRooms: (rooms: Room[]) => void;
  updateRoom: (index: number, partial: Partial<Room>) => void;
  removeRoom: (index: number) => void;
  addRoom: () => void;
  generateBom: () => Promise<void>;
  setCustomerName: (name: string) => void;
  setJobAddress: (address: string) => void;
  setCustomerEmail: (email: string) => void;
  setCustomerPhone: (phone: string) => void;
  setProjectName: (name: string) => void;
  setProjectInfo: (info: Partial<Pick<EstimatorState, "projectName" | "customerName" | "supplierName">>) => void;
  nextStep: () => void;
  setFinancials: (info: Partial<Pick<EstimatorState, "profitMargin" | "laborRate" | "laborHours">>) => void;
  setError: (error: string | null) => void;
  setShowRFQ: (show: boolean) => void;
  reset: () => void;
};

const DEFAULT_ROOM: Room = {
  name: "New Room",
  type: "bedroom",
  floor: 1,
  estimated_sqft: 120,
  width_ft: 10,
  length_ft: 12,
  window_count: 1,
  exterior_walls: 1,
  ceiling_height: 8,
  notes: "",
};

const STEP_ORDER: EstimatorStep[] = ["customer", "upload", "select_pages", "analyzing", "rooms", "bom"];

function initialState(): EstimatorState {
  return {
    step: "customer",
    fileName: "",
    floorplanImg: null,
    pdfPages: [],
    selectedPages: [],
    knownTotalSqft: "",
    knownUnits: 1,
    hvacPerUnit: true,
    climateZone: "warm",
    systemType: "gas_ac",
    analysisProgress: 0,
    analysisResult: null,
    rooms: [],
    bom: null,
    profitMargin: 35,
    laborRate: 85,
    laborHours: 16,
    projectName: "New HVAC Estimate",
    customerName: "",
    jobAddress: "",
    customerEmail: "",
    customerPhone: "",
    supplierName: "Johnstone Supply",
    error: null,
    showRFQ: false,
  };
}

export const useEstimator = create<EstimatorState & EstimatorActions>((set, get) => ({
  ...initialState(),

  setStep: (step) => set({ step }),

  setFile: (fileName, img) => set({ fileName, floorplanImg: img }),

  setPdfPages: (pages) => set({ pdfPages: pages }),

  setSelectedPages: (pages) => set({ selectedPages: pages }),

  setBuildingInfo: (info) => set(info),

  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),

  setAnalysisResult: (result) =>
    set({ analysisResult: result, rooms: result.rooms.map((r) => ({ ...r })), step: "rooms" }),

  setRooms: (rooms) => set({ rooms }),

  updateRoom: (index, partial) =>
    set((state) => {
      const rooms = [...state.rooms];
      rooms[index] = { ...rooms[index], ...partial };
      return { rooms };
    }),

  removeRoom: (index) =>
    set((state) => ({
      rooms: state.rooms.filter((_, i) => i !== index),
    })),

  addRoom: () =>
    set((state) => ({
      rooms: [...state.rooms, { ...DEFAULT_ROOM }],
    })),

  generateBom: async () => {
    const { rooms, climateZone, systemType, analysisResult } = get();
    try {
      const supabase = createClient();
      const { data: catalog } = await supabase
        .from("catalog_items")
        .select("*, supplier:suppliers(*)")
        .order("usage_count", { ascending: false });
      const bom = generateBOM(
        rooms,
        climateZone,
        systemType,
        catalog ?? [],
        analysisResult?.building,
        analysisResult?.hvac_notes,
      );
      set({ bom, step: "bom" });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to generate BOM" });
    }
  },

  setCustomerName: (name) => set({ customerName: name }),

  setJobAddress: (address) => set({ jobAddress: address }),

  setCustomerEmail: (email) => set({ customerEmail: email }),

  setCustomerPhone: (phone) => set({ customerPhone: phone }),

  setProjectName: (name) => set({ projectName: name }),

  setProjectInfo: (info) => set(info),

  nextStep: () =>
    set((state) => {
      const idx = STEP_ORDER.indexOf(state.step);
      const next = STEP_ORDER[idx + 1];
      return next ? { step: next } : {};
    }),

  setFinancials: (info) => set(info),

  setError: (error) => set({ error }),

  setShowRFQ: (show) => set({ showRFQ: show }),

  reset: () => set(initialState()),
}));
