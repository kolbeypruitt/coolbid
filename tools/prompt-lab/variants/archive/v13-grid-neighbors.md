---
name: v13-grid-neighbors
description: v05+v06 — describe neighbors in grid-cell terms, then translate to coords
---

You will reason spatially using a 20×20 grid, then emit coordinates from the grid cell ranges.

## Mental model
Imagine a 20-column × 20-row grid overlaid on the image. Columns A–T. Rows 1–20. A1 is top-left image corner; T20 is bottom-right. Cell width = cell height = 1/20 of the image.

## Step 1 — Identify every room
List every labeled room plus unlabeled enclosed spaces.

## Step 2 — Describe each room's position in grid terms
For each room, write one sentence using this template:

"The {room} occupies cells {top_left_cell}–{bottom_right_cell}. It is bounded on the north by {row R cell name, or 'outer wall'}, on the east by {col C cell name, or 'outer wall'}, on the south by {row R cell name, or 'outer wall'}, on the west by {col C cell name, or 'outer wall'}. It neighbors: {list of adjacent rooms}."

Example: "The Master Bedroom occupies cells B4–E10. It is bounded on the north by row 4 (outer wall), on the east by col F (shared with Master Bath), on the south by row 10 (shared with Hall), on the west by col B (outer wall). Neighbors: Master Bath, Hall."

## Step 3 — Convert grid cells to vertex coordinates
For a rectangular room in cells {top_left}–{bottom_right}:
- Col A=0, B=1, ..., T=19 → x = col/20
- Row 1=0, 2=1, ..., 20=19 → y = row/20
- Top-left vertex = (col_TL/20, row_TL/20)
- Bottom-right vertex = ((col_BR+1)/20, (row_BR+1)/20)

For L-shapes, union multiple rectangles.

## Rules
- Adjacent rooms share cell boundaries EXACTLY — their coords match.
- Follow wall lines, not dimension lines.
- Small rooms (master baths, closets) get their own grid ranges and polygons.
- Rooms on the outer edge of the building should NOT extend to the absolute image edge (col A, col T, row 1, row 20) unless the building really reaches there.

## Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 180,
      "width_ft": 15, "length_ft": 12, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "grid_range": [{"top_left": "B4", "bottom_right": "E10"}],
      "position_description": "The {room} occupies cells B4–E10. Bounded N by row 4 (outer), E by col F (shared Master Bath), S by row 10 (shared Hall), W by col B (outer). Neighbors: Master Bath, Hall.",
      "vertices": [{"x": 0.05, "y": 0.15}, {"x": 0.25, "y": 0.15}, {"x": 0.25, "y": 0.50}, {"x": 0.05, "y": 0.50}],
      "adjacent_rooms": ["Master Bath", "Hall"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
