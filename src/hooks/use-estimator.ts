import { create } from "zustand";
import type { AnalysisResult, BomResult, ClimateZoneKey, Room } from "@/types/hvac";
import { generateBOM } from "@/lib/hvac/bom-generator";

type EstimatorStep = "upload" | "select_pages" | "analyzing" | "rooms" | "bom";

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
  analysisProgress: number;
  analysisResult: AnalysisResult | null;
  rooms: Room[];
  bom: BomResult | null;
  profitMargin: number;
  laborRate: number;
  laborHours: number;
  projectName: string;
  customerName: string;
  supplierName: string;
  error: string | null;
  showRFQ: boolean;
};

type EstimatorActions = {
  setStep: (step: EstimatorStep) => void;
  setFile: (fileName: string, img: string) => void;
  setPdfPages: (pages: PagePreview[]) => void;
  setSelectedPages: (pages: number[]) => void;
  setBuildingInfo: (info: Partial<Pick<EstimatorState, "knownTotalSqft" | "knownUnits" | "hvacPerUnit" | "climateZone">>) => void;
  setAnalysisProgress: (progress: number) => void;
  setAnalysisResult: (result: AnalysisResult) => void;
  setRooms: (rooms: Room[]) => void;
  updateRoom: (index: number, partial: Partial<Room>) => void;
  removeRoom: (index: number) => void;
  addRoom: () => void;
  generateBom: () => void;
  setProjectInfo: (info: Partial<Pick<EstimatorState, "projectName" | "customerName" | "supplierName">>) => void;
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

function initialState(): EstimatorState {
  return {
    step: "upload",
    fileName: "",
    floorplanImg: null,
    pdfPages: [],
    selectedPages: [],
    knownTotalSqft: "",
    knownUnits: 1,
    hvacPerUnit: true,
    climateZone: "warm",
    analysisProgress: 0,
    analysisResult: null,
    rooms: [],
    bom: null,
    profitMargin: 35,
    laborRate: 85,
    laborHours: 16,
    projectName: "New HVAC Estimate",
    customerName: "",
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

  generateBom: () => {
    const { rooms, climateZone, analysisResult } = get();
    try {
      const bom = generateBOM(
        rooms,
        climateZone,
        analysisResult?.building,
        analysisResult?.hvac_notes,
      );
      set({ bom, step: "bom" });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to generate BOM" });
    }
  },

  setProjectInfo: (info) => set(info),

  setFinancials: (info) => set(info),

  setError: (error) => set({ error }),

  setShowRFQ: (show) => set({ showRFQ: show }),

  reset: () => set(initialState()),
}));
