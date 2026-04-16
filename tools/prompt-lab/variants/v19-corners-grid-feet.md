---
name: v19-corners-grid-feet
description: v04+v05+v03 — corners, grid, AND feet-calibrated scale (maxed-out anchoring)
---

You will anchor the building through three layers: image-position corners, a cell-based grid, and a real-world feet scale. Each layer reinforces the others.

## Step 1 — Anchor corners (image coordinates)
Identify the four outer corners:
- `anchors.top_left`, `anchors.top_right`, `anchors.bottom_right`, `anchors.bottom_left`
in normalized 0-1 image coordinates.

## Step 2 — Real-world scale
Read exterior chain dimensions along the top and left sides.
- `building_scale.width_ft` = sum of top chain in feet
- `building_scale.height_ft` = sum of left chain in feet

Compute:
- `scale.ft_per_norm_x` = building_scale.width_ft / (anchors.top_right.x - anchors.top_left.x)
- `scale.ft_per_norm_y` = building_scale.height_ft / (anchors.bottom_left.y - anchors.top_left.y)

## Step 3 — 20×20 building grid
Overlay a 20-column × 20-row grid on the anchor rectangle. Cols A–T, rows 1–20. Each cell in normalized coords:
- cell_w = (anchors.top_right.x - anchors.top_left.x) / 20
- cell_h = (anchors.bottom_left.y - anchors.top_left.y) / 20

In feet, each cell is (building_scale.width_ft / 20) wide × (building_scale.height_ft / 20) tall.

## Step 4 — For each room, pin it TWO ways
Describe each room using BOTH the grid AND the feet-distance from the top-left corner. Example:

"Master Bedroom: grid B3–E10. Offset from anchors.top_left: x = 3 ft east, y = 0 ft south. Dimensions: 14 ft × 14 ft."

This double-specification forces cross-validation — grid cells and feet must agree.

## Step 5 — Convert to vertex coordinates
Use grid cells (from Step 3) as the primary source, cross-check with feet (from Step 2) as a sanity check.

For a room in grid cells (col_TL, row_TL) to (col_BR, row_BR):
- Top-left x = anchors.top_left.x + col_TL × cell_w
- Top-left y = anchors.top_left.y + row_TL × cell_h
- Bottom-right x = anchors.top_left.x + (col_BR + 1) × cell_w
- Bottom-right y = anchors.top_left.y + (row_BR + 1) × cell_h

If the feet-offset disagrees with the grid by more than 1 cell, recheck.

## Rules
- Adjacent rooms share vertex coords exactly.
- Rooms on the building's outer wall use the anchor coord on that edge (no sprawl).
- Small rooms (master baths, closets) are separate polygons.
- Follow thick wall lines, not thin dimension lines.

## Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "anchors": {"top_left": {"x": 0.10, "y": 0.15}, "top_right": {"x": 0.90, "y": 0.15}, "bottom_right": {"x": 0.90, "y": 0.85}, "bottom_left": {"x": 0.10, "y": 0.85}},
  "building_scale": {"width_ft": 50, "height_ft": 40, "ft_per_norm_x": 62.5, "ft_per_norm_y": 57.14},
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 180,
      "width_ft": 15, "length_ft": 12, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "grid_range": [{"top_left": "B3", "bottom_right": "E8"}],
      "feet_offset": {"x_ft": 3, "y_ft": 0, "w_ft": 14, "h_ft": 14},
      "vertices": [{"x": 0.14, "y": 0.23}, {"x": 0.30, "y": 0.23}, {"x": 0.30, "y": 0.43}, {"x": 0.14, "y": 0.43}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
