import { create } from "zustand";

// Prevents rapid double-clicks of "Generate BOM" from interleaving
// delete-then-insert cycles against estimate_bom_items.
let bomGenerationInFlight = false;
import type { AnalysisResult, BomResult, ClimateZoneKey, Room } from "@/types/hvac";
import type { SystemType } from "@/types/catalog";
import { generateBOM } from "@/lib/hvac/bom-generator";
import { createClient } from "@/lib/supabase/client";
import { renderContractorPreferencesPrompt } from "@/lib/contractor-preferences/render-prompt";
import { loadBomCatalog } from "@/lib/estimates/load-bom-catalog";
import { toBomInsertRows } from "@/lib/estimates/bom-rows";
import { enrichBomViaAI } from "@/lib/estimates/enrich-bom-action";
import type { ContractorPreferences } from "@/types/contractor-preferences";

type EstimatorStep = "customer" | "upload" | "select_pages" | "analyzing" | "rooms" | "bom";

type PagePreview = {
  pageNum: number;
  previewUrl: string;
  base64: string;
  mediaType: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type EstimatorState = {
  step: EstimatorStep;
  estimateId: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  fileName: string;
  floorplanImg: string | null;
  pdfPages: PagePreview[];
  selectedPages: number[];
  knownTotalSqft: string;
  knownUnits: number;
  hvacPerUnit: boolean;
  identicalUnits: boolean;
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
  selectedRoomIndex: number | null;
};

type EstimatorActions = {
  setStep: (step: EstimatorStep) => void;
  createDraft: () => Promise<string | null>;
  setFile: (fileName: string, img: string) => void;
  setPdfPages: (pages: PagePreview[]) => void;
  setSelectedPages: (pages: number[]) => void;
  setBuildingInfo: (info: Partial<Pick<EstimatorState, "knownTotalSqft" | "knownUnits" | "hvacPerUnit" | "identicalUnits" | "climateZone" | "systemType">>) => void;
  setAnalysisProgress: (progress: number) => void;
  setAnalysisResult: (result: AnalysisResult) => Promise<void>;
  setRooms: (rooms: Room[]) => void;
  updateRoom: (index: number, partial: Partial<Room>) => void;
  removeRoom: (index: number) => Promise<void>;
  addRoom: () => Promise<void>;
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
  setSelectedRoomIndex: (index: number | null) => void;
  reset: () => void;
};

// Coords are normalized 0–1 relative to the floorplan canvas. Spawn a
// small square centered on the canvas so the room is visible and can be
// dragged/resized from the start; width_ft/length_ft carry the logical
// dimensions (4×4 ft = 16 sqft) while the vertices carry the visual
// handle. Without real vertices, floorplan-canvas.tsx's computeBbox
// collapses to 0×0 on the first drag and the room disappears.
const DEFAULT_ROOM_SIZE = 0.1; // 10% of canvas width/height
const DEFAULT_ROOM_MIN = 0.5 - DEFAULT_ROOM_SIZE / 2;
const DEFAULT_ROOM_MAX = 0.5 + DEFAULT_ROOM_SIZE / 2;

const DEFAULT_ROOM: Room = {
  name: "New Room",
  type: "bedroom",
  floor: 1,
  estimated_sqft: 16,
  width_ft: 4,
  length_ft: 4,
  window_count: 0,
  exterior_walls: 0,
  ceiling_height: 8,
  notes: "",
  conditioned: true,
  polygon_id: "room_0",
  vertices: [
    { x: DEFAULT_ROOM_MIN, y: DEFAULT_ROOM_MIN },
    { x: DEFAULT_ROOM_MAX, y: DEFAULT_ROOM_MIN },
    { x: DEFAULT_ROOM_MAX, y: DEFAULT_ROOM_MAX },
    { x: DEFAULT_ROOM_MIN, y: DEFAULT_ROOM_MAX },
  ],
  bbox: {
    x: DEFAULT_ROOM_MIN,
    y: DEFAULT_ROOM_MIN,
    width: DEFAULT_ROOM_SIZE,
    height: DEFAULT_ROOM_SIZE,
  },
  centroid: { x: 0.5, y: 0.5 },
  adjacent_rooms: [],
};

const STEP_ORDER: EstimatorStep[] = ["customer", "upload", "select_pages", "analyzing", "rooms", "bom"];

// ── Room persistence helpers ─────────────────────────────────────────

/** Shape of an `estimate_rooms` row that our upsert writes. */
function roomToRow(room: Room, estimateId: string) {
  return {
    id: room.id,
    estimate_id: estimateId,
    name: room.name,
    type: room.type,
    floor: room.floor,
    sqft: room.estimated_sqft,
    width_ft: room.width_ft,
    length_ft: room.length_ft,
    window_count: room.window_count,
    exterior_walls: room.exterior_walls,
    ceiling_height: room.ceiling_height,
    notes: room.notes,
    conditioned: room.conditioned,
    bbox_x: room.bbox.x,
    bbox_y: room.bbox.y,
    bbox_width: room.bbox.width,
    bbox_height: room.bbox.height,
    centroid_x: room.centroid.x,
    centroid_y: room.centroid.y,
    vertices: room.vertices,
    adjacent_rooms: room.adjacent_rooms,
  };
}

/** Debounce timers for per-room auto-save. Keyed by room.id. */
const roomSaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const ROOM_SAVE_DEBOUNCE_MS = 500;

function initialState(): EstimatorState {
  return {
    step: "customer",
    estimateId: null,
    saveStatus: "idle",
    saveError: null,
    fileName: "",
    floorplanImg: null,
    pdfPages: [],
    selectedPages: [],
    knownTotalSqft: "",
    knownUnits: 1,
    hvacPerUnit: true,
    identicalUnits: true,
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
    selectedRoomIndex: null,
  };
}

export const useEstimator = create<EstimatorState & EstimatorActions>((set, get) => ({
  ...initialState(),

  setStep: (step) => set({ step }),

  createDraft: async () => {
    const state = get();
    if (state.estimateId) return state.estimateId;

    try {
      const supabase = createClient();
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        set({ error: "Not authenticated" });
        return null;
      }

      const { data, error } = await supabase
        .from("estimates")
        .insert({
          user_id: user.id,
          project_name: state.projectName.trim() || state.jobAddress.trim() || "New Estimate",
          customer_name: state.customerName.trim(),
          job_address: state.jobAddress.trim() || null,
          customer_email: state.customerEmail.trim() || null,
          customer_phone: state.customerPhone.trim() || null,
          status: "draft",
          climate_zone: state.climateZone,
          system_type: state.systemType,
          profit_margin: state.profitMargin,
          labor_rate: state.laborRate,
          labor_hours: state.laborHours,
          supplier_name: state.supplierName.trim() || "",
          num_units: state.knownUnits,
          hvac_per_unit: state.hvacPerUnit,
        })
        .select("id")
        .single();

      if (error || !data) {
        set({ error: error?.message ?? "Failed to create draft" });
        return null;
      }

      const id = data.id as string;
      set({ estimateId: id });
      return id;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create draft" });
      return null;
    }
  },

  setFile: (fileName, img) => set({ fileName, floorplanImg: img }),

  setPdfPages: (pages) => set({ pdfPages: pages }),

  setSelectedPages: (pages) => set({ selectedPages: pages }),

  setBuildingInfo: (info) => set(info),

  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),

  setAnalysisResult: async (result) => {
    // Stamp each room with a client-side UUID so we can upsert by id.
    const roomsWithIds: Room[] = result.rooms.map((r) => ({
      ...r,
      id: r.id ?? crypto.randomUUID(),
    }));
    set({ analysisResult: result, rooms: roomsWithIds, step: "rooms" });

    // Persist: ensure a draft exists → write floorplan row → replace rooms.
    set({ saveStatus: "saving", saveError: null });
    try {
      let estimateId = get().estimateId;
      if (!estimateId) {
        estimateId = await get().createDraft();
        if (!estimateId) throw new Error("Could not create estimate draft");
      }
      const supabase = createClient();

      // One floorplan row per estimate (replace any prior analysis).
      await supabase.from("floorplans").delete().eq("estimate_id", estimateId);
      const { error: fpErr } = await supabase.from("floorplans").insert({
        estimate_id: estimateId,
        file_name: get().fileName || null,
        file_type: get().pdfPages[0]?.mediaType ?? null,
        page_numbers: get().selectedPages.length ? get().selectedPages : [1],
        analysis_result: result,
      });
      if (fpErr) throw fpErr;

      // Replace all rooms for this estimate with the freshly-analyzed set.
      await supabase.from("estimate_rooms").delete().eq("estimate_id", estimateId);
      const rows = roomsWithIds.map((r) => roomToRow(r, estimateId!));
      const { error: roomsErr } = await supabase.from("estimate_rooms").insert(rows);
      if (roomsErr) throw roomsErr;

      set({ saveStatus: "saved" });
    } catch (err) {
      console.error("setAnalysisResult persist failed:", err);
      set({
        saveStatus: "error",
        saveError: err instanceof Error ? err.message : "Save failed",
      });
    }
  },

  setRooms: (rooms) => set({ rooms }),

  updateRoom: (index, partial) => {
    set((state) => {
      const rooms = [...state.rooms];
      rooms[index] = { ...rooms[index], ...partial };
      return { rooms, saveStatus: "saving" };
    });

    const room = get().rooms[index];
    const estimateId = get().estimateId;
    if (!room?.id || !estimateId) return;

    // Debounce per-room so rapid vertex drags coalesce into one write.
    const existing = roomSaveTimers.get(room.id);
    if (existing) clearTimeout(existing);
    roomSaveTimers.set(
      room.id,
      setTimeout(async () => {
        roomSaveTimers.delete(room.id!);
        try {
          const latest = get().rooms.find((r) => r.id === room.id);
          if (!latest) return;
          const supabase = createClient();
          const { error } = await supabase
            .from("estimate_rooms")
            .update(roomToRow(latest, estimateId))
            .eq("id", room.id!);
          if (error) throw error;
          // Only flip to "saved" if no other saves are pending.
          if (roomSaveTimers.size === 0) set({ saveStatus: "saved" });
        } catch (err) {
          console.error("updateRoom persist failed:", err);
          set({
            saveStatus: "error",
            saveError: err instanceof Error ? err.message : "Save failed",
          });
        }
      }, ROOM_SAVE_DEBOUNCE_MS),
    );
  },

  removeRoom: async (index) => {
    const state = get();
    const room = state.rooms[index];
    const { selectedRoomIndex } = state;
    let newSelected = selectedRoomIndex;
    if (selectedRoomIndex === index) newSelected = null;
    else if (selectedRoomIndex != null && selectedRoomIndex > index) newSelected = selectedRoomIndex - 1;

    set({
      rooms: state.rooms.filter((_, i) => i !== index),
      selectedRoomIndex: newSelected,
      saveStatus: room?.id ? "saving" : get().saveStatus,
    });

    if (!room?.id || !state.estimateId) return;
    // Cancel any pending debounced save for this row.
    const pending = roomSaveTimers.get(room.id);
    if (pending) {
      clearTimeout(pending);
      roomSaveTimers.delete(room.id);
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.from("estimate_rooms").delete().eq("id", room.id);
      if (error) throw error;
      if (roomSaveTimers.size === 0) set({ saveStatus: "saved" });
    } catch (err) {
      console.error("removeRoom persist failed:", err);
      set({
        saveStatus: "error",
        saveError: err instanceof Error ? err.message : "Delete failed",
      });
    }
  },

  addRoom: async () => {
    const newRoom: Room = { ...DEFAULT_ROOM, id: crypto.randomUUID() };
    set((state) => ({ rooms: [...state.rooms, newRoom], saveStatus: "saving" }));

    const estimateId = get().estimateId;
    if (!estimateId) {
      set({ saveStatus: "error", saveError: "No estimate draft — room saved locally only" });
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.from("estimate_rooms").insert(roomToRow(newRoom, estimateId));
      if (error) throw error;
      if (roomSaveTimers.size === 0) set({ saveStatus: "saved" });
    } catch (err) {
      console.error("addRoom persist failed:", err);
      set({
        saveStatus: "error",
        saveError: err instanceof Error ? err.message : "Save failed",
      });
    }
  },

  generateBom: async () => {
    if (bomGenerationInFlight) return;
    bomGenerationInFlight = true;
    const { rooms, climateZone, systemType, analysisResult, knownUnits, hvacPerUnit, identicalUnits, estimateId } = get();
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const activeCatalog = user ? await loadBomCatalog(supabase, user.id) : [];

      let preferences: ContractorPreferences | null = null;
      if (user) {
        const { data: prefsRow } = await supabase
          .from("profiles")
          .select("contractor_preferences")
          .eq("id", user.id)
          .single();
        preferences =
          (prefsRow?.contractor_preferences as ContractorPreferences | null) ?? null;
        const preferencesPrompt = renderContractorPreferencesPrompt(preferences);
        if (preferencesPrompt && process.env.NODE_ENV !== "production") {
          console.debug("[contractor-prefs-prompt][use-estimator]", preferencesPrompt);
        }
      }

      const bom = generateBOM(
        rooms,
        climateZone,
        systemType,
        activeCatalog,
        analysisResult?.building,
        analysisResult?.hvac_notes,
        preferences,
      );

      // For identical multi-unit buildings with per-unit HVAC, multiply
      // all quantities by the unit count so the BOM covers the full building.
      const multiplier = hvacPerUnit && identicalUnits && knownUnits > 1 ? knownUnits : 1;
      if (multiplier > 1) {
        bom.items = bom.items.map((item) => ({ ...item, qty: item.qty * multiplier }));
        bom.summary = {
          ...bom.summary,
          designBTU: bom.summary.designBTU * multiplier,
          totalCFM: bom.summary.totalCFM * multiplier,
          totalRegs: bom.summary.totalRegs * multiplier,
          retCount: bom.summary.retCount * multiplier,
          condSqft: bom.summary.condSqft * multiplier,
          zones: bom.summary.zones * multiplier,
        };
      }

      // Phase 3: fill "missing" accessory slots via Haiku before we commit.
      // Runs as a server action so the Anthropic SDK + API key never reach
      // the browser bundle. Enrichment is best-effort — errors server-side
      // are swallowed and the original BOM returned unchanged.
      const enriched = await enrichBomViaAI(bom, activeCatalog, preferences);
      bom.items = enriched.items;
      bom.summary = enriched.summary;

      set({ bom, step: "bom" });

      // Auto-persist so navigating away before "Done — View Estimate"
      // doesn't lose the generated BOM. handleFinish re-persists as a
      // belt-and-suspenders guarantee if this fails silently (offline etc).
      if (estimateId && bom.items.length > 0) {
        const { error: delErr } = await supabase
          .from("estimate_bom_items")
          .delete()
          .eq("estimate_id", estimateId);
        if (delErr) {
          set({ error: `Failed to clear old BOM: ${delErr.message}` });
          return;
        }
        const { error: bomErr } = await supabase
          .from("estimate_bom_items")
          .insert(toBomInsertRows(bom.items, estimateId));
        if (bomErr) {
          set({ error: `Failed to save BOM: ${bomErr.message}` });
        }
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to generate BOM" });
    } finally {
      bomGenerationInFlight = false;
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

  setSelectedRoomIndex: (index) => set({ selectedRoomIndex: index }),

  reset: () => set(initialState()),
}));
