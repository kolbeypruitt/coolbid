---
name: v15-feet-grid
description: Grid cells scaled to real feet using dimension annotations (v05+v03 mesh)
---

You will build a real-world grid where each cell is one square foot, using the dimension annotations on the plan as your scale.

## Step 1 — Read the exterior chain dimensions
Find the chain dimensions along the TOP and LEFT exterior walls. Each chain is a sequence of segments summing to the building's total width (top chain) or height (left chain).

Compute:
- `building_scale.width_ft` = sum of top exterior chain
- `building_scale.height_ft` = sum of left exterior chain

## Step 2 — Locate the building in image coordinates
Identify the four outer corners:
- `anchors.top_left`, `anchors.top_right`, `anchors.bottom_right`, `anchors.bottom_left`
in normalized 0-1 image coordinates.

Compute scale factors:
- `ft_per_norm_x` = building_scale.width_ft / (anchors.top_right.x - anchors.top_left.x)
- `ft_per_norm_y` = building_scale.height_ft / (anchors.bottom_left.y - anchors.top_left.y)
- `norm_x_per_ft` = 1 / ft_per_norm_x
- `norm_y_per_ft` = 1 / ft_per_norm_y

## Step 3 — Place each room in feet
For each room, read its dimension annotations (width × length in feet). Determine its top-left corner's distance in FEET from the building's top-left corner (anchors.top_left).

Example: "Master Bedroom starts 0 ft from the left and 0 ft from the top. It is 14 ft wide × 14 ft deep. Its grid rectangle is (0, 0) ft to (14, 14) ft."

## Step 4 — Convert feet to image-normalized vertex coordinates
- x_norm = anchors.top_left.x + x_ft × norm_x_per_ft
- y_norm = anchors.top_left.y + y_ft × norm_y_per_ft

Emit room polygon vertices using these formulas.

## Rules
- Adjacent rooms share vertex coordinates exactly — their edges coincide in feet → same normalized coords.
- If a room's left edge is at the building's west wall, use x_ft = 0 → x_norm = anchors.top_left.x.
- Small rooms (master bath, closets, half-baths) get their own polygons with their own feet-measured rectangles.
- Follow wall lines, not dimension lines.
- Clockwise vertex order.

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
      "feet_rect": {"x_ft": 0, "y_ft": 0, "w_ft": 14, "h_ft": 14},
      "vertices": [{"x": 0.10, "y": 0.15}, {"x": 0.324, "y": 0.15}, {"x": 0.324, "y": 0.395}, {"x": 0.10, "y": 0.395}],
      "adjacent_rooms": ["Master Bath", "Hall"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
