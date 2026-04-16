---
name: v05-grid-references
description: DIFFERENT FORMAT — describe rooms as 20x20 grid cells (A1–T20), then translate to vertices
---

Analyze the floor plan using a grid-based reasoning approach.

## Mental model
Imagine a 20-column × 20-row grid overlaid on the image. Columns are labeled A through T (left to right). Rows are numbered 1 through 20 (top to bottom). Each cell is 1/20 × 1/20 of the image.

A1 is the top-left corner cell. T20 is the bottom-right corner cell.

## Step 1 — Map each room to its grid cells
For each room in the floor plan:
1. Identify the grid cells the room occupies (e.g., a bedroom in the upper-left might occupy cells B3 through E8).
2. Record the top-left cell and the bottom-right cell of the room's bounding rectangle.
3. If the room is L-shaped, describe it as two or more axis-aligned rectangles, each with its own top-left/bottom-right cell pair.

This gives you a quantized representation of each room — no floating-point guessing.

## Step 2 — Convert grid cells to vertex coordinates
Cell A1 spans x=[0.00, 0.05], y=[0.00, 0.05]. Cell E8 spans x=[0.20, 0.25], y=[0.35, 0.40]. Use this conversion to emit vertex coordinates for each room's polygon.

For a rectangular room spanning top-left cell B3 to bottom-right cell E8:
- Vertices: (0.05, 0.10), (0.25, 0.10), (0.25, 0.40), (0.05, 0.40)

For L-shaped rooms, union the rectangles and emit the combined polygon's vertex list.

## Rules
- Every room MUST be expressed as one or more rectangular grid-cell ranges first.
- Small rooms (master baths, closets, half-baths) often occupy only 1-2 cells — don't skip them.
- Rooms on the building's outer edge should align to cells where the actual exterior wall sits — don't extend to the image edge.
- Follow wall lines, not dimension lines.

## Step 3 — Output
Return ONE valid JSON object. No markdown, no code fences.

For each room, include BOTH `grid_range` (your reasoning artifact) AND `vertices` (the final polygon in normalized 0-1 coords).

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {"stories": 1, "total_sqft": 1725, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [1725]},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 240,
      "width_ft": 12, "length_ft": 20, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "grid_range": [{"top_left": "B3", "bottom_right": "E8"}],
      "vertices": [{"x": 0.05, "y": 0.10}, {"x": 0.25, "y": 0.10}, {"x": 0.25, "y": 0.40}, {"x": 0.05, "y": 0.40}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
