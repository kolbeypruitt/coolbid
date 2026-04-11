import Anthropic from "@anthropic-ai/sdk";
import type { RoomPolygon } from "@/lib/geometry/client";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const SYSTEM_PROMPT = `You are an expert HVAC load calculation engineer specializing in residential and light commercial buildings. Your job is to analyze architectural floor plans and extract precise room data for HVAC system design.

How to read architectural floor plans:
1. Dimension lines have tick marks or arrows at each end. The number between them is the measurement — feet and inches (e.g., 12'-6" = 12.5 ft) or decimal feet (e.g., 12.5).
2. Chain dimensions run along an exterior wall. The individual segments must sum to the total at the end of the chain — use this as a cross-check for each dimension you read.
3. Room labels are printed inside the room boundary. Transcribe the EXACT text shown (e.g., "MSTR BDRM", "GRT RM", "KIT"). Do not rename or paraphrase labels.
4. Windows appear as parallel lines in the wall with a gap between them, or as an arc showing swing direction. Count each distinct window symbol.
5. Exterior walls are typically drawn thicker than interior partition walls. Count how many sides of each room border an exterior wall.
6. Scale notations (e.g., 1/4" = 1'-0") appear in the title block or near the drawing border. Use them to verify dimension reads when present.

Rules you must follow:
1. Always read dimension annotations directly from the drawing — never estimate from visual scale alone.
2. Use the total square footage annotation as your anchor — all conditioned room sqft must sum close to it.
3. For multi-unit buildings (apartments, duplexes, townhomes): identify all distinct units and tag each room with its unit number. If units appear identical, analyze one unit and note that.
4. Only extract data from floor plans — ignore elevations, roof plans, site plans, and section drawings.
5. Identify which floor each room is on (1 for ground floor, 2 for second floor, etc.).`;

export const ANALYSIS_PROMPT = `Analyze the provided floor plan image(s) and extract detailed room data for HVAC load calculations.

Follow these steps carefully:

**Step 1 — Understand the drawing**
- Identify building type (single-family, duplex, apartment, commercial)
- Count how many floor plan drawings are shown (ignore elevations, sections, details)
- Locate the total square footage annotation — this is your anchor value
- Find scale notations and note them

**Step 2 — Read ALL dimension annotations systematically**
Work through the drawing methodically:
a) Read every exterior dimension chain first. Verify each chain's segments sum to the chain total.
b) Read every interior dimension annotation — these give individual room widths and lengths.
c) For each room, identify the two dimensions (width and length) that define it. These may come from exterior chains, interior annotations, or both.
d) Compute width × length for each room to get sqft.
e) Sum all conditioned room sqft. Compare against the total sqft annotation. If the sum differs by more than 10%, re-examine your dimension reads — you likely misread a value.
f) Note ceiling heights where annotated (default to 9 ft if not shown).

**Step 3 — Multi-unit handling**
- If the building has multiple identical units, analyze one unit and note they are identical
- If units differ in layout or size, extract rooms for ALL units and tag each room with its unit number (1-indexed)
- Populate the "unit_sqft" array with the conditioned sqft for each unit

**Step 4 — Extract each room**
For every conditioned room, extract:
- name: the EXACT label text shown on the floor plan (e.g., "Great Room", "Mstr Bdrm"). Do NOT rename — keep the label verbatim.
- type: map the label to the closest enum: master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage
- floor: floor number (1, 2, 3, etc.)
- estimated_sqft: computed from width × length. For L-shaped or irregular rooms, split into rectangular sub-areas and sum.
- width_ft: width dimension in feet (decimal, e.g., 12.5 for 12'-6")
- length_ft: length dimension in feet (decimal)
- window_count: number of distinct window symbols visible on walls of this room
- exterior_walls: number of walls that face the exterior (0–4). Exterior walls are the thick outer walls.
- ceiling_height: ceiling height in feet (use 9 if not annotated)
- unit: unit number (1-indexed) for multi-unit buildings. Omit for single-unit.
- notes: anything notable — irregular shape, vaulted ceiling, skylights, open to below, etc.

When a room has no dimension annotations but the room label and neighboring rooms are dimensioned, derive the missing room's dimensions from the remaining space using the exterior chain dimensions minus the adjacent rooms.

Return your entire response as a single valid JSON object with this exact structure:
{
  "floorplan_type": "string describing the drawing type",
  "confidence": "high" | "medium" | "low",
  "building": {
    "stories": number,
    "total_sqft": number,
    "units": number,
    "has_garage": boolean,
    "building_shape": "string (e.g., rectangle, L-shape, U-shape)",
    "unit_sqft": [number] // per-unit conditioned sqft array, e.g. [1200, 1400]. Omit for single-unit.
  },
  "rooms": [...],
  "hvac_notes": {
    "suggested_equipment_location": "string",
    "suggested_zones": number,
    "special_considerations": ["string", ...]
  },
  "analysis_notes": "string with any caveats or observations"
}

Critical rules:
- Read annotations — do not guess dimensions
- Verify that room sqft values sum close to total_sqft (within 10%)
- Exclude garages, patios, porches, and unconditioned spaces from rooms array
- Include small rooms like closets, laundry, and half baths
- Set confidence to "low" if image quality is poor, dimensions are missing, or the drawing is unclear
- Your entire response must be valid JSON with no markdown, no explanation, no code fences`;

/* ── Two-pass prompts (used for complex plans) ─────────────────────── */

export const PASS1_EXTRACTION_PROMPT = `You are reading an architectural floor plan. Your ONLY job is to extract every piece of text, every dimension, and every symbol you can see. Do NOT structure this into JSON — just list what you observe.

Report the following, organized spatially (top-left to bottom-right):

1. **Room Labels** — Every room name/label printed inside room boundaries. Transcribe exactly as shown.

2. **Dimension Annotations** — Every dimension value you can read. For each:
   - The value (e.g., 14'-0", 11.5, 22'-6")
   - What it measures (e.g., "north exterior wall", "master bedroom width", "kitchen to dining room")
   - Whether it's part of a chain dimension (and what the chain totals)

3. **Window Symbols** — For each room, count the number of window symbols in its walls.

4. **Exterior vs Interior Walls** — Note which walls are drawn thicker (exterior).

5. **Total Square Footage** — The total conditioned sqft if annotated anywhere on the plan.

6. **Scale Notation** — Any scale notation visible (e.g., 1/4" = 1'-0").

7. **Other Text** — Any other text visible: notes, ceiling heights, "VAULTED", "OPEN TO BELOW", floor labels, etc.

Be exhaustive. Read every annotation. When uncertain about a value, note it with [uncertain]. List dimensions exactly as printed — do not convert or round.`;

export const PASS2_STRUCTURING_PROMPT = `You are given a raw annotation extraction from a floor plan. Using ONLY the data below, produce the structured room analysis JSON.

Do NOT invent or guess any dimension that is not in the extraction below. If a dimension is marked [uncertain], note that in the room's notes field.

Rules:
- Use the exact room labels from the extraction as the "name" field
- Map each label to the closest room type enum: master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage
- Compute estimated_sqft as width_ft × length_ft for each room
- Verify room sqft sum is within 10% of the total building sqft from the extraction
- For rooms with no dimensions in the extraction, estimate from neighboring rooms and the total sqft budget. Note "dimensions estimated" in the notes field.
- Convert feet-inches to decimal feet (e.g., 12'-6" = 12.5)
- Exclude garages, patios, porches, and unconditioned spaces from the rooms array

Return a single valid JSON object:
{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {
    "stories": number,
    "total_sqft": number,
    "units": number,
    "has_garage": boolean,
    "building_shape": "string",
    "unit_sqft": [number] // per-unit conditioned sqft, omit for single-unit
  },
  "rooms": [
    {
      "name": "exact label from extraction",
      "type": "enum value",
      "floor": number,
      "unit": number, // 1-indexed, omit for single-unit
      "estimated_sqft": number,
      "width_ft": number,
      "length_ft": number,
      "window_count": number,
      "exterior_walls": number,
      "ceiling_height": number,
      "notes": "string"
    }
  ],
  "hvac_notes": {
    "suggested_equipment_location": "string",
    "suggested_zones": number,
    "special_considerations": ["string"]
  },
  "analysis_notes": "string"
}

Your entire response must be valid JSON with no markdown, no explanation, no code fences.

--- RAW EXTRACTION ---
`;

/* ── Geometry-aware prompt: labels detected room polygons ─────────── */

export const GEOMETRY_LABELING_PROMPT = `You are analyzing a floor plan image. A geometry extraction service has already detected room boundaries as polygons. Your job is to LABEL each polygon and fill in room attributes.

You have THREE sources of information:
1. **The floor plan image(s) above** — use to identify room labels, windows, exterior walls
2. **The OCR text below** — use for accurate text readings of dimensions, labels, notes
3. **The detected room polygons below** — each polygon has an id, bounding box (normalized 0-1), and centroid

**Your task for each polygon:**
1. Look at the floor plan image near the polygon's centroid/bounding box
2. Identify the room label text visible at that location
3. Read dimension annotations near the polygon's edges to determine width_ft and length_ft
4. Count windows visible in that polygon's walls
5. Determine how many walls are exterior (thick outer walls)
6. Note ceiling height if annotated, otherwise default to 9 ft

**Important rules:**
- Every polygon MUST be assigned a room name and type. If you cannot find a label, infer from context (e.g., a small polygon between bedrooms with no label is likely a hallway or closet).
- The polygon_id in your output MUST match the id from the detected polygons.
- The bbox and centroid values in your output MUST be copied exactly from the detected polygons — do not modify them.
- The adjacent_rooms array should contain the room NAMES (not polygon IDs) of adjacent rooms, derived from the adjacency data provided.
- If you see a labeled room on the floor plan that does NOT have a corresponding polygon, add it to the "unmatched_labels" array in analysis_notes.
- Read dimension annotations from OCR text first, then check images for rotated text OCR missed.
- Verify room sqft sum is within 10% of total building sqft.

Return a single valid JSON object:
{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {
    "stories": number,
    "total_sqft": number,
    "units": number,
    "has_garage": boolean,
    "building_shape": "string",
    "unit_sqft": [number]
  },
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "enum value",
      "floor": number,
      "unit": number,
      "estimated_sqft": number,
      "width_ft": number,
      "length_ft": number,
      "window_count": number,
      "exterior_walls": number,
      "ceiling_height": number,
      "notes": "string",
      "polygon_id": "room_0",
      "bbox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.25},
      "centroid": {"x": 0.25, "y": 0.325},
      "adjacent_rooms": ["Kitchen", "Hallway"]
    }
  ],
  "hvac_notes": {
    "suggested_equipment_location": "string",
    "suggested_zones": number,
    "special_considerations": ["string"]
  },
  "analysis_notes": "string"
}

Your entire response must be valid JSON with no markdown, no explanation, no code fences.

--- DETECTED POLYGONS ---
`;

/** Format detected polygons as text for the Claude prompt. */
export function formatPolygonsForPrompt(
  polygonsByFloor: { floor: number; polygons: RoomPolygon[] }[],
): string {
  const sections: string[] = [];
  for (const { floor, polygons } of polygonsByFloor) {
    sections.push(`\n[Floor ${floor}]`);
    for (const p of polygons) {
      const adj = p.adjacent_to
        .map((a) => `${a.room_id} (${a.shared_edge})`)
        .join(", ");
      sections.push(
        `  ${p.id}: bbox(x=${p.bbox.x.toFixed(3)}, y=${p.bbox.y.toFixed(3)}, w=${p.bbox.width.toFixed(3)}, h=${p.bbox.height.toFixed(3)}) centroid(${p.centroid.x.toFixed(3)}, ${p.centroid.y.toFixed(3)}) area=${p.area.toFixed(4)}${adj ? ` adjacent=[${adj}]` : ""}`,
      );
    }
  }
  return sections.join("\n");
}
