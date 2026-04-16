---
name: v06-spatial-relationships
description: Describe each room's neighbors and position first, then emit coordinates
---

Analyze the floor plan by reasoning about spatial relationships before committing to coordinates.

## Step 1 — Identify every room
List every labeled room plus unlabeled enclosed spaces. Include garages, patios, porches, closets, hallways.

## Step 2 — Describe each room's position and neighbors
For each room, write a one-sentence description in this format:

"The {room} is located at the {north/south/east/west/north-west/...} of the building. It is bordered on the {north} by {room or exterior wall}, on the {east} by {room or exterior wall}, on the {south} by {room or exterior wall}, on the {west} by {room or exterior wall}. It is approximately {X} feet wide and {Y} feet deep."

Example: "The Master Bedroom is located at the west end of the building. It is bordered on the north by the exterior wall, on the east by the Master Bath and Hall, on the south by the exterior wall, on the west by the exterior wall. It is approximately 14 feet wide and 14 feet deep."

This forces explicit spatial reasoning BEFORE you estimate coordinates.

## Step 3 — Trace polygons
Using the spatial descriptions, trace each room's polygon:
- A room bordered by an exterior wall has its corresponding edge on the outer perimeter (don't extend beyond).
- A room bordered by another room shares that edge's vertices EXACTLY with the neighbor.
- Follow wall lines (thick, or double-line hatched), never dimension lines.
- Vertices clockwise, starting top-left.
- Small rooms carved into larger ones (master bath off bedroom) get their own polygons.

## Step 4 — Output
Return ONE valid JSON object. No markdown, no code fences.

Each room's `position_description` field contains your Step 2 sentence.

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
      "position_description": "The {room} is located at the {direction}. It is bordered on the north by {x}, east by {y}, south by {z}, west by {w}. It is X feet wide and Y feet deep.",
      "vertices": [{"x": 0.12, "y": 0.30}, {"x": 0.35, "y": 0.30}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
