# Floor Plan Geometry Pipeline

**Date**: 2026-04-11
**Status**: Draft
**Goal**: Replace the treemap-based layout generation with real room positions extracted from floor plan images using SAM 3 segmentation.

## Problem

The current pipeline extracts room dimensions and labels from floor plans (via Document AI OCR + Claude vision) but has zero geometry extraction. Room positions in the schematic are generated algorithmically via a squarified treemap based on sqft — rooms are placed proportionally, not where they actually are on the plan. This means:

- No room adjacency data (which rooms share walls)
- No spatial arrangement (room A is left of room B)
- Duct routing and equipment placement are generic, not informed by actual layout
- The schematic doesn't resemble the real floor plan

## Approach

**SAM 3 segmentation + Claude labeling** — use each tool for what it's good at. SAM 3 handles spatial segmentation (finding room regions and their positions). Claude handles text understanding (labeling rooms, reading dimensions, validating topology).

## Pipeline Architecture

```
User uploads PDF/images
         |
[EXISTING] PDF.js renders pages to JPEG
         |
[NEW] Geometry Service (Python, GPU)
  |-- Pre-process: edge detection -> wall mask
  |-- SAM 3: segment enclosed room regions
  |-- OpenCV: extract polygon contours from masks
  |-- Compute adjacency (shared edges within tolerance)
  |-- Return: RoomPolygon[] with {vertices, bbox, adjacentTo[]}
         |
[MODIFIED] Claude analysis receives:
  |-- Original image (as today)
  |-- Document AI OCR text (as today)
  |-- [NEW] Extracted room polygons
  -> Claude labels rooms, matches dimensions, validates topology
         |
[MODIFIED] AnalysisResult includes required spatial data
         |
[REPLACED] Layout rendering uses real positions (treemap removed)
```

## Geometry Service

### Technology

- **Framework**: FastAPI
- **Core dependencies**: SAM 3 (PyTorch), OpenCV, NumPy
- **Hardware**: GPU required (SAM 3 inference)
- **Hosting**: Replicate or Modal (deploy Docker image with model, pay per inference, no GPU instance management)
- **Endpoint**: `POST /extract-geometry` — accepts image (JPEG/PNG), returns `RoomPolygon[]` JSON
- **Expected latency**: 3-8 seconds per page

### Stage 1: Pre-processing (Wall Detection)

Floor plan walls are the darkest, thickest lines. Before SAM 3 runs:

1. Convert to grayscale, apply adaptive thresholding to isolate dark lines (walls)
2. Morphological operations (dilate/close) to connect wall segments with small gaps (doorways, windows)
3. Produces a closed wall mask where rooms become fully enclosed white regions

This step is critical — floor plans have doors and openings that break room boundaries. Closing those gaps gives SAM clean enclosed regions to segment.

### Stage 2: SAM 3 Segmentation

SAM 3 runs in automatic mask generation mode (no manual prompts). Returns a set of masks, one per detected region.

Post-filtering:
- Discard masks too small (line artifacts, tiny closets below threshold)
- Discard masks spanning the entire image (background)
- Discard masks that overlap significantly with detected walls
- Keep masks that represent enclosed room-sized regions

### Stage 3: Polygon Extraction + Adjacency

For each surviving mask:
1. OpenCV `findContours` extracts the boundary
2. `approxPolyDP` simplifies to a polygon (removes pixel-level jaggedness)
3. Compute bounding box and centroid
4. Normalize all coordinates to 0-1 range relative to image dimensions

Adjacency detection:
- For each pair of room polygons, check if edge segments are parallel and within wall-thickness tolerance
- If so, mark as adjacent with shared edge direction (top/bottom/left/right)

### Output Shape

```typescript
type RoomPolygon = {
  id: string;                          // "room_0", "room_1", ...
  vertices: { x: number; y: number }[]; // normalized 0-1
  bbox: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
  area: number;                         // normalized, proportional to image
  adjacentTo: { roomId: string; sharedEdge: "top" | "bottom" | "left" | "right" }[];
};
```

## Multi-Floor Handling

Each page of a multi-page plan is processed independently by the geometry service. The service returns `RoomPolygon[]` per page. Claude receives all pages' polygons tagged with their page/floor number and handles cross-floor concerns:

- Rooms are assigned to floors based on which page they came from (user selects pages during upload, page order = floor order as it works today)
- Adjacency is computed only within the same floor — no cross-floor adjacency
- Stacked rooms (e.g., bedroom above living room) are not tracked spatially; that's not needed for duct routing within a floor

## Claude Integration Changes

Claude's role shifts from spatial guesser to **labeler and validator**.

### Prompt changes

Claude receives the `RoomPolygon[]` array alongside the image and OCR text. The prompt instructs Claude to:

1. **Match labels to polygons** — For each polygon, look at the floor plan image near its centroid/bbox. Identify the room label text and room type.
2. **Match dimensions to polygons** — For each polygon, read dimension annotations near its edges. Assign width_ft and length_ft.
3. **Validate adjacency** — Does detected adjacency make sense? Flag suspicious adjacency (e.g., two master bedrooms adjacent with no hallway).
4. **Fill non-spatial attributes** — Window counts, exterior wall detection, ceiling height notes, HVAC notes. Same as today.
5. **Handle unmatched regions** — If SAM found a region Claude can't label, or Claude sees a label SAM missed, the analysis fails with mismatch details.

### What stays the same

- Document AI OCR still runs for text extraction
- Two-pass logic for complex plans
- Zod validation and type coercion
- Building info constraints (total sqft, unit count)
- Confidence scoring

## Data Model Changes

### Room type gains required spatial fields

```typescript
type Room = {
  // ...existing fields (name, type, floor, sqft, dimensions, etc.)...
  polygon_id: string;        // links to geometry service output
  bbox: { x: number; y: number; width: number; height: number }; // normalized 0-1
  centroid: { x: number; y: number };
  adjacent_rooms: string[];  // room names this room shares walls with
};
```

These fields are **required**, not optional. No fallback to treemap.

### Database migration

```sql
-- Nullable columns so existing rows aren't broken by the migration.
-- Application code enforces NOT NULL for new estimates via Zod schema.
ALTER TABLE estimate_rooms ADD COLUMN bbox_x         NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_y         NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_width     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_height    NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN centroid_x     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN centroid_y     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN adjacent_rooms TEXT[] DEFAULT '{}';
```

Columns are nullable at the DB level so existing rows survive the migration. The Zod schema enforces these fields as required for all new estimates — any INSERT missing spatial data will be rejected at the application boundary.

## Layout Rendering Changes

### Treemap removal

The squarified treemap algorithm in `floorplan-layout.ts` is deleted. No fallback path.

### Real position rendering

1. **Map normalized coordinates to SVG space** — Scale 0-1 bbox positions to the 400x300 SVG viewbox (minus padding)
2. **Room rectangles use actual positions** — x, y, width, height from real bbox data
3. **Adjacency-informed duct routing** — Trunk follows the longest adjacency chain rather than a fixed central horizontal line. Branches tap off where rooms actually connect.
4. **Equipment placement uses real geometry** — Position based on Claude's identified equipment location relative to actual room positions.

### Register placement

Stays algorithmic — distribute registers within each room's real bbox using existing grid logic.

## Error Handling

No retries, no silent recovery. Every failure surfaces with diagnostic detail.

| Failure | Behavior |
|---------|----------|
| Geometry service unreachable | Analysis fails: "Floor plan geometry service unavailable" |
| SAM 3 finds 0 room regions | Analysis fails: "Could not detect room boundaries in floor plan" |
| SAM 3 finds fewer rooms than Claude labels | Analysis fails with mismatch count details |
| SAM 3 finds more regions than Claude can label | Analysis fails, surfaces which polygons had no match |
| Geometry service times out | Analysis fails after timeout, logs image dimensions and page count |
| Pre-processing produces no wall mask | Analysis fails: "Could not detect walls in floor plan" |

### Observability

Log each geometry extraction:
- Image size, page number
- Contour count, polygon count, adjacency edge count
- Processing time per stage (pre-processing, SAM 3, contour extraction)

Log Claude label-matching:
- Polygons matched, unmatched count, confidence

All goes to existing logging infrastructure.

## Infrastructure

### API timeout

Current max duration is 120s. Geometry service adds 3-8s per page. Bump to 180s for multi-page plans.

### Cost model

- Geometry service: pay-per-inference on Replicate/Modal (no idle GPU costs)
- Claude: same usage as today, potentially reduced token cost since Claude does less spatial guessing
- Document AI: unchanged

## Files affected

| File | Change |
|------|--------|
| `src/types/hvac.ts` | Add required spatial fields to Room type |
| `src/types/duct-layout.ts` | Update LayoutRoom to use real positions |
| `src/lib/anthropic.ts` | Modify prompts to accept and label polygons |
| `src/lib/hvac/floorplan-layout.ts` | Replace treemap with real-position rendering |
| `src/lib/analyze/validate-analysis.ts` | Add geometry validation (polygon count vs room count) |
| `src/lib/analyze/schema.ts` | Add Zod schemas for spatial fields |
| `src/app/api/analyze-docai/route.ts` | Add geometry service call before Claude |
| `src/app/api/analyze/route.ts` | Add geometry service call before Claude |
| `src/components/estimator/analyzing-step.tsx` | Update progress steps to include geometry extraction |
| Database migration | Add spatial columns to estimate_rooms |
| New: Geometry service repo | Python FastAPI service with SAM 3 |
