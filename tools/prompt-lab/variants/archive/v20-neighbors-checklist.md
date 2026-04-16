---
name: v20-neighbors-checklist
description: v06 neighbors + mandatory self-validation checklist before output
---

You will reason about each room's neighbors before emitting coordinates, then run a validation pass.

## Step 1 — Identify every room
Include every labeled room, unlabeled enclosed spaces (halls, closets, utility), garages, patios, porches.

## Step 2 — Describe spatial relationships
For each room, one sentence:

"The {room} is located at the {direction} of the building. Bordered N by {room_or_outer_wall}, E by {room_or_outer_wall}, S by {room_or_outer_wall}, W by {room_or_outer_wall}. Dimensions (from plan): {X} ft × {Y} ft."

## Step 3 — Trace polygons
Use the spatial descriptions to assign normalized 0-1 vertex coords:
- Outer-wall borders → coord matches building's outer edge.
- Shared-wall borders → both rooms use the same coord on that edge.
- Small rooms (master baths, closets, half-baths) get their own polygons.
- Clockwise vertex order, starting top-left.
- Follow thick wall lines, not thin dimension lines.

## Step 4 — MANDATORY self-validation
Before outputting, go through each check and fix failures:

☐ **A. Outer boundary**: All rooms claiming an outer-wall border share the SAME x or y coordinate on that edge. (E.g., all rooms with N = outer should have the same top y.)

☐ **B. Shared edges**: For every pair of adjacent rooms, the shared edge has IDENTICAL coords in both polygons.

☐ **C. No engulfment**: For every large room (>150 sqft), there are no smaller rooms (bath, closet) whose polygon is covered by this one. If there are, SPLIT them.

☐ **D. No sprawl**: No polygon edge extends into blank paper, the title block, or past the last visible wall.

☐ **E. Sqft sanity**: Conditioned sqft sum within 20% of total_sqft.

☐ **F. All rooms present**: Every room you described in Step 2 has a polygon. No dropped entries.

If any fail, go back, fix, and rerun the checklist. Only emit when all six pass.

## Output
Return ONE valid JSON object. No markdown, no code fences.

Include `validation` showing the result of each check.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "validation": {"A_outer_boundary": "pass", "B_shared_edges": "pass", "C_no_engulfment": "pass", "D_no_sprawl": "pass", "E_sqft_sanity": "pass", "F_all_rooms_present": "pass"},
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 180,
      "width_ft": 15, "length_ft": 12, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "position_description": "The {room} is at the {direction}. N: {border}. E: {border}. S: {border}. W: {border}. X ft × Y ft.",
      "vertices": [{"x": 0.12, "y": 0.30}, {"x": 0.35, "y": 0.30}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
