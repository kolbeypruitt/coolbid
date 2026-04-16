---
name: v02-perimeter-first
description: Outer walls first → building boundary → rooms anchored to that boundary
---

Analyze the floor plan image. You will work OUTSIDE-IN: first lock down the building's outer perimeter, then fill it with rooms.

## Step 1 — Trace the outer perimeter
Find the THICKEST continuous lines in the drawing — these are the exterior walls that form the building's outer boundary. They typically appear as double lines with dense hatching, clearly heavier than any interior partition.

Window symbols will appear as GAPS in these outer walls (two parallel lines with a break, or an arc). IGNORE the gaps — trace the outer perimeter AS IF the windows were solid wall. The perimeter is a single closed polygon around the entire conditioned building footprint (include attached garages, exclude detached patios/porches/decks for this step).

Emit the perimeter as `building_outline.vertices` in clockwise order, normalized 0-1 to the image. The outline should have as many vertices as needed to capture the building's shape (rectangles get 4, L-shapes get 6, etc.). Every vertex must sit on an actual exterior wall line you can see in the image.

## Step 2 — Identify interior partition walls
Briefly note where the interior partition walls run. You don't need to trace them, but understanding the partition layout helps you place room polygons accurately in Step 3.

## Step 3 — Trace each room's polygon
For each room inside the perimeter:
- If the room touches an exterior wall, its outer edge is ON the perimeter polygon you traced in Step 1. Do not create a new edge in empty space beyond the perimeter.
- If the room's edges are interior partitions, trace along the inside face of those partitions.
- A room's vertex that falls on the perimeter should have coordinates that match the perimeter polygon at that point — reuse the same x/y values you used in Step 1.

Also trace separately, OUTSIDE the perimeter:
- Attached unconditioned spaces (garages if separately walled, covered patios, porches, decks, storage).

## Rules
- Vertices clockwise, starting top-left, normalized 0-1 to the full image.
- Coordinates on a shared edge between two rooms must be IDENTICAL — they share vertices, they don't overlap.
- Small rooms carved into larger ones (master bath off bedroom, closet off hall) get their own polygon; the larger room's polygon stops at the shared wall.
- Every polygon edge terminates at a visible wall line — never extend into blank paper.

## Step 4 — Dimensions and attributes
For each room, read the dimension annotations to get width_ft and length_ft. `estimated_sqft = width_ft × length_ft`.

## Step 5 — Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {"stories": 1, "total_sqft": 1725, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [1725]},
  "building_outline": {"vertices": [{"x": 0.1, "y": 0.2}, {"x": 0.9, "y": 0.2}, {"x": 0.9, "y": 0.8}, {"x": 0.1, "y": 0.8}]},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 240,
      "width_ft": 12, "length_ft": 20, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "vertices": [{"x": 0.12, "y": 0.30}, {"x": 0.35, "y": 0.30}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
