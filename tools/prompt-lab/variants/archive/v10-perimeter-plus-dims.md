---
name: v10-perimeter-plus-dims
description: Combines v02 (perimeter first) + v03 (dimensions as scale anchor)
---

Analyze the floor plan. You will establish two anchors before drawing rooms: the building's outer perimeter AND its real-world scale from dimension annotations.

## Step 1 — Read the exterior chain dimensions
Find the chain dimensions along the TOP and LEFT exterior walls. Each chain is a sequence of dimensions (e.g., "20'-0", 9'-11", 5'-0", ...") that sums to the building's total width or height.

Emit:
- `building_scale.width_ft` = sum of top exterior chain in feet
- `building_scale.height_ft` = sum of side exterior chain in feet

If you can't find exterior chains, use the total sqft annotation + best-guess dimensions.

## Step 2 — Trace the outer perimeter
Find the THICKEST continuous lines in the drawing — these are the exterior walls.

Window symbols appear as gaps (parallel lines with a break, or an arc). TREAT WINDOW GAPS AS SOLID WALL — the perimeter is continuous through windows.

Trace the building perimeter as a single closed polygon, clockwise starting top-left, in normalized 0-1 coordinates of the image. Attached garages are part of the perimeter. Detached patios/porches/decks are NOT — they'll be separate polygons.

Use only the number of vertices needed to capture the shape (4 for rectangle, 6 for L, 8 for U, etc.).

Emit as `building_outline.vertices`.

## Step 3 — Compute scale-anchored bounds
From Step 1 and Step 2 together:
- `left_norm` = the smallest x value in your perimeter
- `top_norm` = the smallest y value in your perimeter
- `right_norm` = the largest x value in your perimeter
- `bottom_norm` = the largest y value in your perimeter

Each foot of real-world building corresponds to `(right_norm - left_norm) / width_ft` in normalized x units (and similarly for y). Store these as `building_scale.ft_per_norm_x` and `ft_per_norm_y`.

## Step 4 — Place each room
For each room:
- Read its width and length from the dimension annotations.
- Figure out its position relative to the perimeter corners (e.g., "this room's west wall IS the building's west exterior wall; its north wall is 3 feet south of the top").
- Use the scale factors from Step 3 to compute normalized vertex coordinates.
- If a room's edge lies on the perimeter, its vertex coordinates on that edge MUST match the perimeter polygon at that point.

## Rules
- Follow walls, not dimension lines.
- Double-line hatched walls: inner edge.
- Vertices clockwise, starting top-left.
- Adjacent rooms share vertices exactly.
- Small rooms (master baths, closets, half-baths) get their own polygons.
- Never extend polygons past the perimeter you traced in Step 2.

## Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "building_outline": {"vertices": [{"x": 0.10, "y": 0.15}, {"x": 0.90, "y": 0.15}, {"x": 0.90, "y": 0.85}, {"x": 0.10, "y": 0.85}]},
  "building_scale": {"width_ft": 50, "height_ft": 40, "left_norm": 0.10, "top_norm": 0.15, "right_norm": 0.90, "bottom_norm": 0.85, "ft_per_norm_x": 62.5, "ft_per_norm_y": 57.14},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 180,
      "width_ft": 15, "length_ft": 12, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "vertices": [{"x": 0.12, "y": 0.30}, {"x": 0.35, "y": 0.30}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
