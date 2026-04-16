---
name: v03-dimensions-first
description: Read every dimension annotation first, use as scale anchor before tracing
---

Analyze the floor plan. Work in this order: dimensions → layout → polygons.

## Step 1 — Read every dimension
Before drawing anything, catalog every dimension annotation in the plan. Dimension lines are THIN lines with tick marks or arrows at each end, with a number between them. Record:
- Exterior chain dimensions along each side of the building (with total)
- Interior width and length annotations for each room
- Any special notes (ceiling heights, "VAULTED", "SUNKEN", door openings)

Use feet-inches (e.g., 12'-6") or decimal feet. Verify: each exterior chain's segments must sum to the chain total. If they don't, re-read.

## Step 2 — Compute building scale
Using the dimensions you just read:
- Building outer width in feet = sum of top exterior chain
- Building outer height in feet = sum of side exterior chain
This gives you a real-world scale. Every pixel corresponds to a known number of feet.

## Step 3 — Place rooms on a scale-anchored grid
For each room, you already know its width_ft and length_ft from Step 1. Use those dimensions plus the room's position in the drawing to compute its normalized 0-1 vertex coordinates.

For example: if the building is 50 feet wide from x=0.10 to x=0.90 (so 1 foot ≈ 0.016 normalized units) and a bedroom starts 10 feet from the left wall and is 14 feet wide, its left edge is at x = 0.10 + 10 × 0.016 = 0.26 and its right edge is at x = 0.10 + 24 × 0.016 = 0.484.

Do this computation for every room. This keeps polygons tight to actual wall positions instead of visual estimates.

## Step 4 — Tracing rules
- Follow WALL LINES, not dimension lines.
- Double-line hatched walls: trace the INNER edge.
- Vertices clockwise, starting top-left.
- Shared edges between adjacent rooms: same exact coords.
- Small rooms (master bath, closets, half-baths) get their own polygons.
- Every polygon edge terminates at a visible wall line.

## Step 5 — Output
Return ONE valid JSON object. No markdown, no code fences.

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {"stories": 1, "total_sqft": 2500, "units": 1, "has_garage": true, "building_shape": "L-shape", "unit_sqft": [2500]},
  "building_scale": {"width_ft": 50, "height_ft": 40, "left_norm": 0.10, "top_norm": 0.15, "right_norm": 0.90, "bottom_norm": 0.85},
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
