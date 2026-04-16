---
name: v16-corners-verify
description: v04 corners + explicit self-verification pass before final output
---

You will use four outer corners as anchors, trace rooms, then run through an explicit verification checklist before emitting the result.

## Step 1 — Four outer anchors
Find the four outer corners of the building's exterior footprint:
- `anchors.top_left`, `anchors.top_right`, `anchors.bottom_right`, `anchors.bottom_left`
in normalized 0-1 image coordinates.

## Step 2 — Trace all rooms
For each room (labeled or unlabeled enclosed spaces):
- Follow thick wall lines, not dimension lines.
- Rooms bordering an outer wall use the anchor coord on that edge.
- Small rooms (master baths, closets) get separate polygons.
- Vertices clockwise, starting top-left.

## Step 3 — SELF-VERIFY before output
Before emitting your JSON, run through this checklist and FIX any violations:

**A. Outer wall alignment** — For every room that borders the building exterior:
- North border = anchors.top edge → room's top y equals anchors.top_left.y
- South border = anchors.bottom edge → room's bottom y equals anchors.bottom_left.y
- East border = anchors.right edge → room's right x equals anchors.top_right.x
- West border = anchors.left edge → room's left x equals anchors.top_left.x

**B. Shared edges** — For every pair of adjacent rooms:
- The shared edge has IDENTICAL coords in both polygons. If they differ even slightly, reconcile.

**C. No engulfment** — For every large room (living room, kitchen, family room):
- Scan its interior. If there are closets, baths, or storage carved out of it (visible on the plan), those must be SEPARATE polygons with the larger room's polygon NOT covering them.

**D. No sprawl into blank paper** — For every room:
- Every polygon edge must terminate at a visible wall. No edges extending into blank margins.

**E. Sqft sanity** — Sum the estimated_sqft of all conditioned rooms. If it's more than 20% off the total_sqft you computed, you probably misread a dimension somewhere.

If any check fails, FIX the rooms and re-verify before outputting.

## Step 4 — Emit
Return ONE valid JSON object. No markdown, no code fences.

Include a `verification` field with the results of each check (A through E): "passed" or "fixed: <brief note>".

{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "anchors": {"top_left": {"x": 0.10, "y": 0.15}, "top_right": {"x": 0.90, "y": 0.15}, "bottom_right": {"x": 0.90, "y": 0.85}, "bottom_left": {"x": 0.10, "y": 0.85}},
  "verification": {"outer_wall_alignment": "passed", "shared_edges": "passed", "no_engulfment": "fixed: split Master Bath out of Living Room", "no_sprawl": "passed", "sqft_sanity": "passed"},
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
