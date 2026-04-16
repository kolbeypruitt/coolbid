---
name: v17-perimeter-corners-grid
description: v02+v04+v05 — trace outer perimeter polygon, then define grid relative to corners, then rooms
---

You will anchor the drawing through three progressively tighter layers.

## Layer 1 — Outer perimeter polygon
The THICKEST continuous lines in the drawing are exterior walls. Trace them as a single closed polygon (the building outline), treating window gaps as continuous wall. If the building is rectangular, this is 4 vertices. L-shape, 6. U-shape, 8.

Emit as `building_outline.vertices` clockwise starting top-left, in normalized 0-1 image coords.

## Layer 2 — Anchor corners
From the perimeter, pick the four points forming the tightest axis-aligned bounding rectangle around the building:
- `anchors.top_left` = (min x in perimeter, min y in perimeter)
- `anchors.top_right` = (max x, min y)
- `anchors.bottom_right` = (max x, max y)
- `anchors.bottom_left` = (min x, max y)

## Layer 3 — Building-relative 20×20 grid
Inside the anchor rectangle, define columns A–T and rows 1–20. Each cell is 1/20 of the building's anchor width × 1/20 of the building's anchor height.

## Step — Trace each room
For each room:
- Identify its grid-cell range (top_left cell → bottom_right cell).
- Compute its vertex coords using the anchors and cell indices:
  - x = anchors.top_left.x + col × (anchors.top_right.x - anchors.top_left.x) / 20
  - y = anchors.top_left.y + row × (anchors.bottom_left.y - anchors.top_left.y) / 20
- If the room's edge lies on the perimeter (i.e., on an exterior wall), reuse the exact perimeter vertex coordinates from Layer 1 at that point — don't drift.
- Adjacent rooms share edge coords exactly.
- Small rooms (master bath, closets) get their own polygons.

## Rules
- Follow thick walls, not thin dimension lines.
- Every polygon edge terminates at a visible wall — never sprawl into blank paper.
- Detached outbuildings (covered patios, porches) are OUTSIDE the perimeter — their own polygons, separate from the main outline.

## Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building_outline": {"vertices": [{"x": 0.10, "y": 0.15}, {"x": 0.90, "y": 0.15}, {"x": 0.90, "y": 0.85}, {"x": 0.10, "y": 0.85}]},
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
      "vertices": [{"x": 0.14, "y": 0.23}, {"x": 0.30, "y": 0.23}, {"x": 0.30, "y": 0.43}, {"x": 0.14, "y": 0.43}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
