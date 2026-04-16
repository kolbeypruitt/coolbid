---
name: v04-corners-first
description: Identify 4 outer building corners explicitly, trace rooms relative to them
---

Analyze the floor plan image. Start by nailing down four anchor points, then everything else is relative to them.

## Step 1 — Identify the four outer building corners
Look at the drawing and find the four outermost corners of the building's exterior wall footprint. These are the points where exterior walls meet at the extremes of the building.

If the building is a simple rectangle, these are the four corners. If it's an L-shape, U-shape, or more complex, pick the four points that form the tightest axis-aligned bounding rectangle around the conditioned building footprint.

Emit them as `anchors`:
- `anchors.top_left`, `anchors.top_right`, `anchors.bottom_right`, `anchors.bottom_left`
- Each in normalized 0-1 coordinates of the full image.
- These must sit on ACTUAL corners you can see in the drawing — not guessed.

## Step 2 — Identify every room
List every labeled room plus unlabeled enclosed spaces (hallways, closets, utility). Include garages, patios, porches.

## Step 3 — Trace room polygons
For each room, trace its polygon IN REFERENCE to the four anchors you established.

Mental model: imagine a coordinate system where `anchors.top_left` is (0, 0), `anchors.bottom_right` is (1, 1), and the interior walls divide it up. Use this relative grid to place each vertex, then convert back to image-normalized 0-1 coordinates using the anchors.

Rules:
- Follow wall lines (thick, or double-line with hatching), never dimension lines.
- If a room borders the exterior, its outer edge uses the same coordinates as the anchor or perimeter (no drift into blank space).
- Small rooms carved into bigger ones (bathrooms off bedrooms, closets off halls) get their own polygons.
- Vertices clockwise, starting from the top-left of each room.
- Adjacent rooms SHARE vertices on their common edge.

## Step 4 — Dimensions
Read dimension annotations for each room. `estimated_sqft = width_ft × length_ft`.

## Step 5 — Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "anchors": {
    "top_left": {"x": 0.10, "y": 0.15},
    "top_right": {"x": 0.90, "y": 0.15},
    "bottom_right": {"x": 0.90, "y": 0.85},
    "bottom_left": {"x": 0.10, "y": 0.85}
  },
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
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
