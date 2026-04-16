---
name: v18-compact-combined
description: Terse combination of corners+grid+neighbors — tests whether brevity wins
---

Work through 4 steps. Be concise, accurate, exhaustive.

1. **Anchors**: find the 4 outer building corners. Emit `anchors.top_left`, `top_right`, `bottom_right`, `bottom_left` in normalized 0-1 image coords.

2. **Grid**: 20×20 cells inside the anchor rectangle. Cols A–T. Rows 1–20.

3. **Rooms**: for each room (including closets, halls, baths branching off bedrooms, garage, patios, porches):
   - Grid cell range (top-left → bottom-right cell)
   - Neighbors list
   - Dimensions in feet from the plan's annotations

4. **Coords**: compute vertices from grid cells using the anchors:
   - x = anchors.top_left.x + col × (anchors.top_right.x − anchors.top_left.x) / 20
   - y = anchors.top_left.y + row × (anchors.bottom_left.y − anchors.top_left.y) / 20
   - A room at an outer edge uses the anchor's exact coordinate (no drift).
   - Adjacent rooms share vertex coords exactly.
   - Small rooms get their own polygons; don't engulf them in larger ones.

Follow thick wall lines, not thin dimension lines.

Return ONE JSON object, no markdown:

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "anchors": {"top_left": {"x": 0.10, "y": 0.15}, "top_right": {"x": 0.90, "y": 0.15}, "bottom_right": {"x": 0.90, "y": 0.85}, "bottom_left": {"x": 0.10, "y": 0.85}},
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "rooms": [
    {
      "name": "string",
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
