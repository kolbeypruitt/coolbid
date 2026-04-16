---
name: v11-corners-grid
description: v04+v05 — corners define a 20x20 grid relative to the building, rooms as cell ranges
---

You will work inside-the-building, not inside-the-image. First lock down the four outer corners, then use those corners to define a grid that the rooms live in.

## Step 1 — Four outer anchors
Identify the four outermost corners of the building's exterior wall footprint. These are the points where exterior walls meet at the extremes of the axis-aligned bounding rectangle around the conditioned building.

Emit as `anchors` with normalized 0-1 image coordinates:
- `anchors.top_left`, `anchors.top_right`, `anchors.bottom_right`, `anchors.bottom_left`

Each must sit on an actual visible corner in the drawing — no guessing into blank space.

## Step 2 — Define the building grid
Treat the rectangle formed by your four anchors as the reference frame. Divide it into a 20-column × 20-row grid. Columns A through T (left to right). Rows 1 through 20 (top to bottom). A1 is the anchor `top_left` cell; T20 is the anchor `bottom_right` cell.

Each cell is exactly (1/20) of the building's width by (1/20) of the building's height.

## Step 3 — Map each room to building grid cells
For each room, identify the grid-cell range it occupies as a top-left cell and bottom-right cell. Example: "BR2 occupies B15 to F20" means that room's bounding rectangle spans columns B–F and rows 15–20 of the building grid.

For L-shaped rooms, use multiple rectangles unioned together.

## Step 4 — Convert cells to image-normalized vertex coordinates
Use the anchors plus cell indices to compute image-normalized vertex coords:
- Let `ax`, `ay` = anchors.top_left, `bx`, `by` = anchors.bottom_right
- Cell width (normalized) = (bx - ax) / 20
- Cell height (normalized) = (by - ay) / 20
- For cell column C (A=0, B=1, ..., T=19) and row R (1=0, 2=1, ..., 20=19):
  - Cell's top-left x = ax + C × cell_width
  - Cell's top-left y = ay + R × cell_height

Emit room polygons using these converted coordinates.

## Rules
- Small rooms (master baths, closets) get their own polygons.
- Adjacent rooms share cell boundaries exactly — their vertex coordinates match.
- Rooms that border the building's outer wall terminate at the anchor edge, not past it.
- Follow wall lines, not dimension lines.

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
      "vertices": [{"x": 0.18, "y": 0.22}, {"x": 0.30, "y": 0.22}, {"x": 0.30, "y": 0.43}, {"x": 0.18, "y": 0.43}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
