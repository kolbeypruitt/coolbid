---
name: v09-high-confidence-only
description: Prioritize accuracy over coverage — allow missing rooms rather than wrong polygons
---

Analyze the floor plan image. Your primary goal is ACCURACY of the polygons you emit, not coverage of every room.

## Principle
It is better to omit a room you're unsure about than to emit a polygon that extends past the actual walls. A missing room is a small editing task for the user; a sprawling polygon is a harder editing task.

## Step 1 — Identify rooms you can see clearly
List every room whose boundary you can trace with HIGH confidence: all four edges are clearly visible wall lines, and the label is unambiguous.

For each such room, set `confidence_tracing: "high"`.

## Step 2 — Add medium-confidence rooms
Add rooms whose edges are mostly clear but have some ambiguity (e.g., one partition wall is hard to see). Set `confidence_tracing: "medium"`.

## Step 3 — Skip or mark low-confidence rooms
If you cannot confidently place a room's polygon because walls are hard to see, the label is ambiguous, or the area is cluttered with annotations, DO NOT emit a polygon with coordinates you're guessing. Either:
- Omit the room entirely, OR
- Emit it with `confidence_tracing: "low"` and a deliberately small, conservative polygon at the room's approximate center (width and height ~1/3 of what you estimate). This tells the downstream UI "something is here, user needs to adjust it."

## Tracing rules
- Follow thick wall lines, not thin dimension lines.
- Vertices clockwise from top-left, normalized 0-1.
- Every polygon edge terminates at a VISIBLE wall line — never extrapolate into blank space.
- Adjacent rooms share vertices exactly on their common edge.
- Small rooms (master bath, closets) get their own polygons.

## Output
Return ONE valid JSON object. No markdown, no code fences.

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
      "confidence_tracing": "high",
      "vertices": [{"x": 0.12, "y": 0.30}, {"x": 0.35, "y": 0.30}, {"x": 0.35, "y": 0.55}, {"x": 0.12, "y": 0.55}],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {"suggested_equipment_location": "", "suggested_zones": 1, "special_considerations": []},
  "analysis_notes": ""
}
