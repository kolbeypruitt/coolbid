---
name: v07-minimal
description: Stripped-down short prompt — tests whether verbosity helps or hurts
---

For every room in this floor plan, output its polygon as a list of 0-1 normalized vertices (clockwise, starting top-left).

Include: bedrooms, baths, kitchen, living, dining, halls, closets, utility, foyer, garage, patios, porches.
Exclude: title block, scale bar, margins, legend.

Follow thick wall lines. Ignore thin dimension lines. Small rooms (baths, closets) get their own polygons — do not engulf them in larger rooms.

Return ONE JSON object, no markdown:

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "rooms": [
    {
      "name": "string",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 180,
      "width_ft": 15, "length_ft": 12, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "vertices": [{"x": 0.12, "y": 0.30}, {"x": 0.35, "y": 0.30}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": []
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
