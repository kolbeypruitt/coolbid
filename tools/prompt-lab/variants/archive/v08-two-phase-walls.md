---
name: v08-two-phase-walls
description: DIFFERENT FORMAT — emit wall line-segments first, rooms reference wall IDs
---

Analyze the floor plan in two phases: first identify all walls as line segments, then describe rooms as the set of walls that enclose them.

## Phase 1 — Identify walls
A wall is a continuous line segment in the drawing that separates one space from another (or from the outside).

For each wall, emit:
- `id`: stable identifier ("wall_0", "wall_1", ...)
- `kind`: "exterior" (thickest, outer perimeter) or "interior" (thinner, partition)
- `start`: {x, y} normalized 0-1 of the wall's starting endpoint
- `end`: {x, y} normalized 0-1 of the wall's ending endpoint

Every wall endpoint should be at a real visible corner or tee-junction in the drawing. If two walls meet at a corner, they share the same {x, y} endpoint — use IDENTICAL coordinates.

You will have exterior walls (forming the building's outer perimeter) plus interior walls (partitions between rooms). Window gaps in exterior walls don't break the wall into segments — treat the exterior wall as continuous THROUGH windows.

## Phase 2 — Describe each room
For each room, emit:
- `name`, `type`, dimensions, etc. (standard fields)
- `walls`: list of wall IDs that enclose this room, in clockwise order starting from the top-left wall
- `vertices`: the polygon derived by walking the walls in order — but ALSO emit this explicitly, with each vertex matching a wall endpoint from Phase 1

## Rules
- Don't invent wall endpoints. Every wall endpoint is a visible feature in the drawing.
- Adjacent rooms share the wall that separates them — they reference the same wall ID in their `walls` list.
- Small enclosed spaces (master baths, closets, halls) are their own rooms with their own wall lists.

## Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "walls": [
    {"id": "wall_0", "kind": "exterior", "start": {"x": 0.10, "y": 0.15}, "end": {"x": 0.90, "y": 0.15}},
    {"id": "wall_1", "kind": "exterior", "start": {"x": 0.90, "y": 0.15}, "end": {"x": 0.90, "y": 0.85}}
  ],
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 180,
      "width_ft": 15, "length_ft": 12, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "walls": ["wall_0", "wall_5", "wall_8", "wall_3"],
      "vertices": [{"x": 0.12, "y": 0.15}, {"x": 0.35, "y": 0.15}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
