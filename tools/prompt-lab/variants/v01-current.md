---
name: v01-current
description: Baseline — exact copy of production prompt (Step 1-4 with detailed tracing rules)
---

Analyze the floor plan image and extract EVERY room with its polygon boundary.

## Step 1 — Identify rooms
List every labeled room PLUS any unlabeled enclosed spaces (halls, closets, utility, etc.). Include:
- All conditioned rooms (bedrooms, living areas, baths)
- Garages, patios, porches, decks, storage
Exclude: title block, scale bar, drawing border, legend, elevations, sections.

## Step 2 — Trace polygon boundaries
For each room, trace the polygon that follows the inside face of its WALLS.

**CRITICAL rules for polygon tracing:**
- Follow WALL LINES (thick, or double-line with hatching) — NOT dimension lines.
- Dimension lines are thin, sit OUTSIDE walls, and have tick marks/arrows at their endpoints — never trace along them.
- If walls are drawn as double parallel lines with hatching, trace the INNER edge of the wall pair.
- Vertices in clockwise order starting from the top-left corner of the room.
- Use AT LEAST 4 vertices (rectangles) and as many as needed for L-shapes, bays, or angled walls.
- Coordinates are normalized 0-1 relative to the FULL image dimensions (x=0 is left edge, y=0 is top edge, x=1 is right, y=1 is bottom).
- Polygons must NOT overlap — adjacent rooms share an edge, they do not overlap.
- Polygons must stay inside the floor-plan drawing region; do not extend into margins, title block, or blank photo background.
- EVERY polygon edge must terminate at a visible wall line. If a room's wall ends at a certain pixel, the polygon edge stops there — do NOT continue the edge into blank paper, white space, or past the last visible wall.
- Small rooms carved out of larger ones (e.g., a master bathroom off a bedroom, a closet off a hallway, a half-bath tucked beside a kitchen) MUST be traced as their own separate polygon. The adjacent larger room's polygon must stop at the shared wall and NOT engulf the smaller room.

## Step 3 — Extract attributes from dimension annotations
For each room, read the dimension annotations (feet-inches or decimal feet) to get width_ft and length_ft. Compute estimated_sqft = width_ft × length_ft.

## Step 4 — Assign stable polygon IDs
Number rooms in reading order (top-left to bottom-right) as "room_0", "room_1", etc.

## Output format
Return ONE valid JSON object. No markdown, no code fences, no explanation.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1,
      "unit": 1,
      "estimated_sqft": 180,
      "width_ft": 15,
      "length_ft": 12,
      "window_count": 2,
      "exterior_walls": 2,
      "ceiling_height": 9,
      "notes": "",
      "polygon_id": "room_0",
      "vertices": [{"x": 0.12, "y": 0.30}, {"x": 0.35, "y": 0.30}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "string", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": "anything notable"
}
