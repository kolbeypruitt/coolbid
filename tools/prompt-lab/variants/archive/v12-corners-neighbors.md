---
name: v12-corners-neighbors
description: v04+v06 — four outer corners as anchors, each room described by its neighbors before coords
---

You will anchor the building with four corners, then place each room by reasoning about its neighbors — not by guessing pixel positions.

## Step 1 — Four outer anchors
Identify the four outer corners of the building's exterior footprint:
- `anchors.top_left`, `anchors.top_right`, `anchors.bottom_right`, `anchors.bottom_left`
in normalized 0-1 image coordinates. These sit on visible corners in the drawing.

## Step 2 — Identify every room
List every labeled room plus unlabeled enclosed spaces (halls, closets, utility, bathrooms that branch off bedrooms). Include garages, patios, porches.

## Step 3 — Describe each room's position using the anchors
For each room, write a one-sentence description in this template:

"The {room_name} is located at the {direction, using compass terms} of the building. On the north, it is bordered by {room_name or anchors.top exterior wall}. On the east, by {room or east wall}. On the south, by {room or south wall}. On the west, by {room or west wall}. From dimension annotations, it is {X} feet wide (east-west) by {Y} feet deep (north-south)."

Use "anchors.top edge", "anchors.right edge", "anchors.bottom edge", "anchors.left edge" when a room's border IS the outer perimeter — not "exterior wall" in general, but specifically tied to the anchor rectangle so coordinates chain correctly.

## Step 4 — Trace polygons
Using the spatial descriptions:
- If a room borders `anchors.top edge`, its top y-coord EQUALS `anchors.top_left.y`.
- If a room borders `anchors.left edge`, its left x-coord EQUALS `anchors.top_left.x`.
- (Similarly for right and bottom.)
- Shared walls between two rooms: both rooms use the same exact coords for that edge.
- Small rooms (master baths, closets, half-baths) get their own polygons.
- Follow wall lines, not dimension lines.
- Vertices clockwise, starting top-left.

## Output
Return ONE valid JSON object. No markdown, no code fences.

Each room includes both `position_description` (your spatial reasoning) and `vertices` (the final polygon).

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "anchors": {"top_left": {"x": 0.10, "y": 0.15}, "top_right": {"x": 0.90, "y": 0.15}, "bottom_right": {"x": 0.90, "y": 0.85}, "bottom_left": {"x": 0.10, "y": 0.85}},
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1, "unit": 1, "estimated_sqft": 180,
      "width_ft": 15, "length_ft": 12, "window_count": 2, "exterior_walls": 2, "ceiling_height": 9, "notes": "",
      "polygon_id": "room_0",
      "position_description": "The {room} is at the {direction}. North: {border}. East: {border}. South: {border}. West: {border}. {X} ft wide x {Y} ft deep.",
      "vertices": [{"x": 0.12, "y": 0.30}, {"x": 0.35, "y": 0.30}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
