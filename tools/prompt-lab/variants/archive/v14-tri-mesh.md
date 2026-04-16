---
name: v14-tri-mesh
description: All three winners meshed — corners (v04) + grid (v05) + neighbors (v06)
---

You will work through three layers of anchoring before emitting coordinates: (1) outer corners, (2) a grid relative to those corners, (3) neighbor descriptions that chain through the grid.

## Step 1 — Four outer anchors
Find the four outermost corners of the building's exterior footprint. Emit as:
- `anchors.top_left`, `anchors.top_right`, `anchors.bottom_right`, `anchors.bottom_left`
in normalized 0-1 image coordinates.

## Step 2 — Define a 20×20 building-relative grid
Inside the rectangle formed by your anchors, define a 20-column × 20-row grid. Columns A–T, rows 1–20. A1 = anchor top_left cell; T20 = anchor bottom_right cell.

Cell normalized size:
- cell_w = (anchors.top_right.x - anchors.top_left.x) / 20
- cell_h = (anchors.bottom_left.y - anchors.top_left.y) / 20

## Step 3 — Describe each room using grid + neighbors
For each room, one sentence:

"The {room} occupies cells {TL}–{BR}. Bordered N by {row or anchors.top edge}, E by {col or anchors.right edge}, S by {row or anchors.bottom edge}, W by {col or anchors.left edge}. Neighbors: {list}. Dimensions: {X} ft × {Y} ft."

Use "anchors.top edge" etc. when the room's border IS the outer perimeter — this forces the coordinate to equal the anchor coordinate.

## Step 4 — Convert to image-normalized vertex coordinates
For cell column C (A=0..T=19) and row R (1=0..20=19):
- x = anchors.top_left.x + C × cell_w
- y = anchors.top_left.y + R × cell_h

Room's top-left vertex: (anchors.top_left.x + TL_col × cell_w, anchors.top_left.y + TL_row × cell_h)
Room's bottom-right vertex: (anchors.top_left.x + (BR_col+1) × cell_w, anchors.top_left.y + (BR_row+1) × cell_h)

## Rules
- Shared walls: both rooms use IDENTICAL coords on that edge.
- Small rooms (master baths, closets, half-baths) get their own polygons.
- A room with N edge = `anchors.top edge` has its top y-coord EQUAL to anchors.top_left.y.
- Follow wall lines, not dimension lines.
- Clockwise vertex order, starting top-left.

## Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "anchors": {"top_left": {"x": 0.10, "y": 0.15}, "top_right": {"x": 0.90, "y": 0.15}, "bottom_right": {"x": 0.90, "y": 0.85}, "bottom_left": {"x": 0.10, "y": 0.85}},
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 180,
      "width_ft": 15, "length_ft": 12, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "grid_range": [{"top_left": "B3", "bottom_right": "E8"}],
      "position_description": "The {room} occupies B3–E8. N: anchors.top edge. E: col F (shared Master Bath). S: row 9 (shared Hall). W: anchors.left edge. Neighbors: Master Bath, Hall. 14 ft x 14 ft.",
      "vertices": [{"x": 0.14, "y": 0.15}, {"x": 0.30, "y": 0.15}, {"x": 0.30, "y": 0.43}, {"x": 0.14, "y": 0.43}],
      "adjacent_rooms": ["Master Bath", "Hall"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
