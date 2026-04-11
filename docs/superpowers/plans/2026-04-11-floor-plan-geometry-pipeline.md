# Floor Plan Geometry Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace treemap-based layout with SAM 3 room segmentation so the schematic reflects real floor plan positions and adjacency.

**Architecture:** A standalone Python/FastAPI geometry service (SAM 3 + OpenCV) extracts room polygons from floor plan images. The Next.js app calls this service before Claude analysis. Claude labels the detected polygons instead of guessing spatial positions. The treemap layout generator is replaced with real-position rendering.

**Tech Stack:** Python 3.11+, FastAPI, SAM 3 (PyTorch), OpenCV, NumPy | Next.js, TypeScript, Zod, Vitest, Supabase (Postgres)

**Spec:** `docs/superpowers/specs/2026-04-11-floor-plan-geometry-pipeline-design.md`

---

## File Structure

### New files (Geometry Service)

| File | Responsibility |
|------|---------------|
| `geometry-service/pyproject.toml` | Python project config, dependencies |
| `geometry-service/app/__init__.py` | Package init |
| `geometry-service/app/main.py` | FastAPI app with `/extract-geometry` endpoint |
| `geometry-service/app/preprocess.py` | Wall detection via adaptive threshold + morphological ops |
| `geometry-service/app/segment.py` | SAM 3 automatic mask generation + post-filtering |
| `geometry-service/app/polygons.py` | Contour extraction, polygon simplification, adjacency computation |
| `geometry-service/app/types.py` | Pydantic response models (RoomPolygon, etc.) |
| `geometry-service/tests/test_preprocess.py` | Tests for wall detection |
| `geometry-service/tests/test_polygons.py` | Tests for contour extraction + adjacency |
| `geometry-service/tests/test_api.py` | Integration tests for the endpoint |
| `geometry-service/tests/conftest.py` | Shared fixtures (synthetic floor plan images) |
| `geometry-service/Dockerfile` | Container image with SAM 3 model weights |

### New files (Next.js)

| File | Responsibility |
|------|---------------|
| `src/lib/geometry/client.ts` | HTTP client for geometry service |
| `src/lib/geometry/__tests__/client.test.ts` | Tests for geometry client |
| `src/lib/hvac/__tests__/floorplan-layout-geometry.test.ts` | Tests for new real-position layout |
| `supabase/migrations/012_room_geometry.sql` | Add spatial columns to estimate_rooms |

### Modified files

| File | Change |
|------|--------|
| `src/types/hvac.ts` | Add required spatial fields to `Room` type |
| `src/types/duct-layout.ts` | No changes needed (LayoutRoom already has x/y/width/height) |
| `src/lib/analyze/schema.ts` | Add Zod schemas for bbox, centroid, adjacent_rooms, polygon_id |
| `src/lib/analyze/validate-analysis.ts` | Add geometry validation (polygon-room count match) |
| `src/lib/anthropic.ts` | Add geometry-aware prompt that labels detected polygons |
| `src/app/api/analyze-docai/route.ts` | Call geometry service before Claude, pass polygons to prompt, bump maxDuration |
| `src/app/api/analyze/route.ts` | Call geometry service before Claude, pass polygons to prompt, bump maxDuration |
| `src/lib/hvac/floorplan-layout.ts` | Delete treemap, replace with real-position mapping |
| `src/components/estimator/analyzing-step.tsx` | Update progress step labels |

### Deleted code

| What | Why |
|------|-----|
| Treemap algorithm in `floorplan-layout.ts` (functions: `squarify`, `worstAspectRatio`, `layoutRow`, types: `TreemapRect`, `WeightedItem`) | Replaced by real positions from geometry service |
| `src/lib/hvac/__tests__/floorplan-layout.test.ts` | Replaced by `floorplan-layout-geometry.test.ts` |

---

## Task 1: Python Geometry Service — Project Scaffold + Pre-processing

**Files:**
- Create: `geometry-service/pyproject.toml`
- Create: `geometry-service/app/__init__.py`
- Create: `geometry-service/app/types.py`
- Create: `geometry-service/app/preprocess.py`
- Create: `geometry-service/tests/conftest.py`
- Create: `geometry-service/tests/test_preprocess.py`

- [ ] **Step 1: Create project scaffold**

```toml
# geometry-service/pyproject.toml
[project]
name = "coolbid-geometry"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "opencv-python-headless>=4.10",
    "numpy>=2.0",
    "pydantic>=2.10",
]

[project.optional-dependencies]
gpu = [
    "torch>=2.5",
    "segment-anything-3>=0.1",
]
dev = [
    "pytest>=8.0",
    "httpx>=0.28",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

```python
# geometry-service/app/__init__.py
```

- [ ] **Step 2: Create Pydantic response models**

```python
# geometry-service/app/types.py
from pydantic import BaseModel


class Point(BaseModel):
    x: float
    y: float


class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class AdjacencyEdge(BaseModel):
    room_id: str
    shared_edge: str  # "top" | "bottom" | "left" | "right"


class RoomPolygon(BaseModel):
    id: str
    vertices: list[Point]
    bbox: BBox
    centroid: Point
    area: float
    adjacent_to: list[AdjacencyEdge]


class GeometryResult(BaseModel):
    polygons: list[RoomPolygon]
    image_width: int
    image_height: int
```

- [ ] **Step 3: Create synthetic floor plan fixture for tests**

```python
# geometry-service/tests/conftest.py
import cv2
import numpy as np
import pytest


@pytest.fixture
def simple_floorplan() -> np.ndarray:
    """Create a synthetic 800x600 floor plan image with 4 rooms.

    Layout (white background, black walls):
    +-------------------+-------------------+
    |                   |                   |
    |    Room A         |    Room B         |
    |    (200x150)      |    (200x150)      |
    |                   |                   |
    +-------------------+-------------------+
    |                   |                   |
    |    Room C         |    Room D         |
    |    (200x150)      |    (200x150)      |
    |                   |                   |
    +-------------------+-------------------+

    Walls are 6px thick black lines. Small 10px gaps for doorways.
    """
    img = np.ones((600, 800, 3), dtype=np.uint8) * 255
    wall_color = (0, 0, 0)
    t = 6  # wall thickness

    # Outer walls
    cv2.rectangle(img, (100, 75), (700, 525), wall_color, t)

    # Vertical center wall (with 10px door gap at y=280-290)
    cv2.line(img, (400, 75), (400, 280), wall_color, t)
    cv2.line(img, (400, 290), (400, 525), wall_color, t)

    # Horizontal center wall (with 10px door gap at x=250-260)
    cv2.line(img, (100, 300), (250, 300), wall_color, t)
    cv2.line(img, (260, 300), (700, 300), wall_color, t)

    return img


@pytest.fixture
def empty_image() -> np.ndarray:
    """A blank white image with no walls."""
    return np.ones((400, 400, 3), dtype=np.uint8) * 255
```

- [ ] **Step 4: Write failing tests for pre-processing**

```python
# geometry-service/tests/test_preprocess.py
import numpy as np
from app.preprocess import detect_walls, close_gaps


def test_detect_walls_finds_dark_lines(simple_floorplan: np.ndarray):
    wall_mask = detect_walls(simple_floorplan)

    # Wall mask should be binary (0 or 255)
    unique = np.unique(wall_mask)
    assert set(unique).issubset({0, 255})

    # Walls should be detected (white pixels in mask)
    wall_pixels = np.count_nonzero(wall_mask)
    assert wall_pixels > 0

    # Check that wall locations have mask pixels
    # Center vertical wall at x=400 should be detected
    center_col = wall_mask[:, 400]
    assert np.any(center_col > 0)


def test_detect_walls_returns_empty_for_blank(empty_image: np.ndarray):
    wall_mask = detect_walls(empty_image)
    # Blank image should have very few or no wall pixels
    wall_ratio = np.count_nonzero(wall_mask) / wall_mask.size
    assert wall_ratio < 0.01


def test_close_gaps_fills_doorways(simple_floorplan: np.ndarray):
    wall_mask = detect_walls(simple_floorplan)
    closed = close_gaps(wall_mask, gap_size=15)

    # After closing, the horizontal wall at y=300 should be continuous
    # (the 10px door gap should be filled by a 15px kernel)
    row = closed[300, 100:700]
    # Most of the row should be wall (allowing some tolerance)
    wall_fraction = np.count_nonzero(row) / len(row)
    assert wall_fraction > 0.85
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd geometry-service && pip install -e ".[dev]" && pytest tests/test_preprocess.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.preprocess'`

- [ ] **Step 6: Implement pre-processing**

```python
# geometry-service/app/preprocess.py
import cv2
import numpy as np


def detect_walls(image: np.ndarray) -> np.ndarray:
    """Detect wall lines via adaptive thresholding on a floor plan image.

    Args:
        image: BGR floor plan image (numpy array).

    Returns:
        Binary mask where 255 = wall pixel, 0 = non-wall.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Adaptive threshold isolates dark lines (walls) against lighter background.
    # Block size 51 and C=15 tuned for architectural drawings where walls
    # are the darkest, thickest features.
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15
    )

    # Remove small noise (text, hatching) — walls are thick, noise is thin.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

    return cleaned


def close_gaps(wall_mask: np.ndarray, gap_size: int = 15) -> np.ndarray:
    """Close small gaps in wall mask (doorways, windows) to create enclosed rooms.

    Args:
        wall_mask: Binary wall mask (255 = wall).
        gap_size: Maximum gap width in pixels to close.

    Returns:
        Wall mask with gaps closed.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (gap_size, gap_size))
    closed = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    return closed
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd geometry-service && pytest tests/test_preprocess.py -v`
Expected: All 3 tests PASS

- [ ] **Step 8: Commit**

```bash
git add geometry-service/
git commit -m "feat(geometry): scaffold Python service with wall detection pre-processing"
```

---

## Task 2: Python Geometry Service — Polygon Extraction + Adjacency

**Files:**
- Create: `geometry-service/app/polygons.py`
- Create: `geometry-service/tests/test_polygons.py`

- [ ] **Step 1: Write failing tests for polygon extraction**

```python
# geometry-service/tests/test_polygons.py
import cv2
import numpy as np
import pytest
from app.preprocess import detect_walls, close_gaps
from app.polygons import extract_room_polygons, compute_adjacency
from app.types import RoomPolygon


def _get_room_masks(floorplan: np.ndarray) -> list[np.ndarray]:
    """Helper: get closed wall mask and flood-fill to find rooms."""
    wall_mask = detect_walls(floorplan)
    closed = close_gaps(wall_mask, gap_size=15)

    # Invert: rooms are white (non-wall) regions
    inverted = cv2.bitwise_not(closed)
    return [inverted]


class TestExtractRoomPolygons:
    def test_finds_rooms_in_simple_floorplan(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        # Should find 4 rooms (the synthetic plan has 4 quadrants)
        assert len(polygons) == 4

    def test_polygons_have_normalized_coordinates(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        for poly in polygons:
            assert 0 <= poly.bbox.x <= 1
            assert 0 <= poly.bbox.y <= 1
            assert 0 < poly.bbox.width <= 1
            assert 0 < poly.bbox.height <= 1
            assert 0 <= poly.centroid.x <= 1
            assert 0 <= poly.centroid.y <= 1
            for v in poly.vertices:
                assert 0 <= v.x <= 1
                assert 0 <= v.y <= 1

    def test_polygons_have_unique_ids(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)
        ids = [p.id for p in polygons]
        assert len(ids) == len(set(ids))

    def test_filters_tiny_regions(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        # min_area_ratio filters out regions smaller than threshold
        polygons = extract_room_polygons(
            closed, image_width=w, image_height=h, min_area_ratio=0.5
        )

        # All 4 rooms are ~equal size (~0.125 of image each), so with 0.5 threshold all filtered
        assert len(polygons) == 0

    def test_returns_empty_for_blank_image(self, empty_image: np.ndarray):
        wall_mask = detect_walls(empty_image)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = empty_image.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        # Blank image has no enclosed rooms (just one big region = background)
        assert len(polygons) == 0


class TestComputeAdjacency:
    def test_adjacent_rooms_share_edges(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)
        with_adj = compute_adjacency(polygons, wall_thickness=0.02)

        # In a 2x2 grid, each corner room should be adjacent to 2 others
        for poly in with_adj:
            assert len(poly.adjacent_to) == 2

    def test_no_self_adjacency(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)
        with_adj = compute_adjacency(polygons, wall_thickness=0.02)

        for poly in with_adj:
            neighbor_ids = [a.room_id for a in poly.adjacent_to]
            assert poly.id not in neighbor_ids
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd geometry-service && pytest tests/test_polygons.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.polygons'`

- [ ] **Step 3: Implement polygon extraction and adjacency**

```python
# geometry-service/app/polygons.py
import cv2
import numpy as np
from .types import RoomPolygon, Point, BBox, AdjacencyEdge


def extract_room_polygons(
    closed_wall_mask: np.ndarray,
    image_width: int,
    image_height: int,
    min_area_ratio: float = 0.005,
    max_area_ratio: float = 0.8,
) -> list[RoomPolygon]:
    """Extract room polygons from a closed wall mask using flood-fill + contours.

    Args:
        closed_wall_mask: Binary mask where 255 = wall.
        image_width: Original image width (for normalization).
        image_height: Original image height (for normalization).
        min_area_ratio: Minimum room area as fraction of image area.
        max_area_ratio: Maximum room area as fraction of image area (filters background).

    Returns:
        List of RoomPolygon with normalized (0-1) coordinates.
    """
    # Invert: we want room regions (non-wall) as foreground
    room_regions = cv2.bitwise_not(closed_wall_mask)

    # Find contours of enclosed regions
    contours, _ = cv2.findContours(room_regions, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    image_area = image_width * image_height
    polygons: list[RoomPolygon] = []
    room_idx = 0

    for contour in contours:
        area = cv2.contourArea(contour)
        area_ratio = area / image_area

        # Filter by area: too small = artifact, too large = background
        if area_ratio < min_area_ratio or area_ratio > max_area_ratio:
            continue

        # Simplify contour to polygon
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        # Compute bounding box and centroid
        x, y, w, h = cv2.boundingRect(approx)
        moments = cv2.moments(approx)
        if moments["m00"] == 0:
            continue
        cx = moments["m10"] / moments["m00"]
        cy = moments["m01"] / moments["m00"]

        # Normalize all coordinates to 0-1
        vertices = [
            Point(x=float(pt[0][0]) / image_width, y=float(pt[0][1]) / image_height)
            for pt in approx
        ]

        polygon = RoomPolygon(
            id=f"room_{room_idx}",
            vertices=vertices,
            bbox=BBox(
                x=x / image_width,
                y=y / image_height,
                width=w / image_width,
                height=h / image_height,
            ),
            centroid=Point(x=cx / image_width, y=cy / image_height),
            area=area_ratio,
            adjacent_to=[],
        )
        polygons.append(polygon)
        room_idx += 1

    return polygons


def compute_adjacency(
    polygons: list[RoomPolygon],
    wall_thickness: float = 0.02,
) -> list[RoomPolygon]:
    """Compute room adjacency by checking if bounding boxes are within wall thickness.

    Two rooms are adjacent if their bounding box edges are parallel and within
    `wall_thickness` (normalized) of each other, AND they overlap along the
    shared axis by at least 20% of the smaller room's extent.

    Args:
        polygons: List of room polygons.
        wall_thickness: Maximum gap between edges to consider adjacent (normalized).

    Returns:
        Updated polygons with adjacent_to populated.
    """
    updated = [p.model_copy(update={"adjacent_to": []}) for p in polygons]

    for i in range(len(updated)):
        a = updated[i]
        a_left = a.bbox.x
        a_right = a.bbox.x + a.bbox.width
        a_top = a.bbox.y
        a_bottom = a.bbox.y + a.bbox.height

        for j in range(i + 1, len(updated)):
            b = updated[j]
            b_left = b.bbox.x
            b_right = b.bbox.x + b.bbox.width
            b_top = b.bbox.y
            b_bottom = b.bbox.y + b.bbox.height

            # Check vertical adjacency (rooms side by side)
            # A's right edge near B's left edge
            if abs(a_right - b_left) < wall_thickness:
                overlap = _vertical_overlap(a, b)
                if overlap > 0.2:
                    updated[i].adjacent_to.append(AdjacencyEdge(room_id=b.id, shared_edge="right"))
                    updated[j].adjacent_to.append(AdjacencyEdge(room_id=a.id, shared_edge="left"))
                    continue

            # B's right edge near A's left edge
            if abs(b_right - a_left) < wall_thickness:
                overlap = _vertical_overlap(a, b)
                if overlap > 0.2:
                    updated[i].adjacent_to.append(AdjacencyEdge(room_id=b.id, shared_edge="left"))
                    updated[j].adjacent_to.append(AdjacencyEdge(room_id=a.id, shared_edge="right"))
                    continue

            # Check horizontal adjacency (rooms stacked)
            # A's bottom edge near B's top edge
            if abs(a_bottom - b_top) < wall_thickness:
                overlap = _horizontal_overlap(a, b)
                if overlap > 0.2:
                    updated[i].adjacent_to.append(AdjacencyEdge(room_id=b.id, shared_edge="bottom"))
                    updated[j].adjacent_to.append(AdjacencyEdge(room_id=a.id, shared_edge="top"))
                    continue

            # B's bottom edge near A's top edge
            if abs(b_bottom - a_top) < wall_thickness:
                overlap = _horizontal_overlap(a, b)
                if overlap > 0.2:
                    updated[i].adjacent_to.append(AdjacencyEdge(room_id=b.id, shared_edge="top"))
                    updated[j].adjacent_to.append(AdjacencyEdge(room_id=a.id, shared_edge="bottom"))
                    continue

    return updated


def _vertical_overlap(a: RoomPolygon, b: RoomPolygon) -> float:
    """Fraction of vertical overlap between two rooms (0-1)."""
    a_top, a_bottom = a.bbox.y, a.bbox.y + a.bbox.height
    b_top, b_bottom = b.bbox.y, b.bbox.y + b.bbox.height
    overlap_start = max(a_top, b_top)
    overlap_end = min(a_bottom, b_bottom)
    if overlap_end <= overlap_start:
        return 0.0
    overlap_len = overlap_end - overlap_start
    min_height = min(a.bbox.height, b.bbox.height)
    return overlap_len / min_height if min_height > 0 else 0.0


def _horizontal_overlap(a: RoomPolygon, b: RoomPolygon) -> float:
    """Fraction of horizontal overlap between two rooms (0-1)."""
    a_left, a_right = a.bbox.x, a.bbox.x + a.bbox.width
    b_left, b_right = b.bbox.x, b.bbox.x + b.bbox.width
    overlap_start = max(a_left, b_left)
    overlap_end = min(a_right, b_right)
    if overlap_end <= overlap_start:
        return 0.0
    overlap_len = overlap_end - overlap_start
    min_width = min(a.bbox.width, b.bbox.width)
    return overlap_len / min_width if min_width > 0 else 0.0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd geometry-service && pytest tests/test_polygons.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add geometry-service/app/polygons.py geometry-service/tests/test_polygons.py
git commit -m "feat(geometry): add polygon extraction and adjacency computation"
```

---

## Task 3: Python Geometry Service — SAM 3 Segmentation Module

**Files:**
- Create: `geometry-service/app/segment.py`

Note: SAM 3 requires GPU and model weights. This module is structured so it can be swapped out for the simpler contour-based approach in Task 2 during local testing. SAM 3's key advantage is **text-prompted segmentation** — we prompt with "enclosed room" rather than relying on generic automatic mask generation.

- [ ] **Step 1: Implement SAM 3 segmentation module**

Check the SAM 3 repo (`https://github.com/facebookresearch/sam3`) for current API before writing this. The code below uses the expected API shape — verify imports, model loading, and text-prompt API against the actual library.

```python
# geometry-service/app/segment.py
import logging
import numpy as np

logger = logging.getLogger(__name__)

# SAM 3 is optional — fall back to contour-based extraction if not available.
# This lets the service run on CPU for development/testing.
try:
    from sam3 import build_sam3, SAM3Predictor

    SAM3_AVAILABLE = True
except ImportError:
    SAM3_AVAILABLE = False
    logger.info("SAM 3 not installed — using contour-based extraction only")


_predictor: "SAM3Predictor | None" = None


def _get_predictor(
    checkpoint: str = "/models/sam3_hiera_large.pt",
) -> "SAM3Predictor":
    """Lazily initialize SAM 3 predictor (loads model on first call)."""
    global _predictor
    if _predictor is not None:
        return _predictor

    if not SAM3_AVAILABLE:
        raise RuntimeError("SAM 3 is not installed. Install with: pip install segment-anything-3")

    model = build_sam3(checkpoint=checkpoint, device="cuda")
    _predictor = SAM3Predictor(model)
    return _predictor


def segment_rooms_sam3(image: np.ndarray) -> list[np.ndarray]:
    """Use SAM 3's text-prompted segmentation to find room regions.

    SAM 3's Promptable Concept Segmentation lets us ask for "enclosed room"
    regions specifically, rather than generic automatic segmentation.

    Args:
        image: BGR floor plan image.

    Returns:
        List of binary masks, one per detected room region.
    """
    predictor = _get_predictor()
    rgb = image[:, :, ::-1]  # BGR to RGB

    # Use text prompt to specifically find enclosed room regions
    # NOTE: Verify this API against the actual sam3 library docs
    predictor.set_image(rgb)
    masks, scores, _ = predictor.predict(
        text_prompt="enclosed room on architectural floor plan",
        multimask_output=True,
    )

    image_area = image.shape[0] * image.shape[1]
    room_masks: list[np.ndarray] = []

    for i, mask in enumerate(masks):
        area = np.count_nonzero(mask)
        area_ratio = area / image_area

        # Skip background (too large) and noise (too small)
        if area_ratio > 0.8 or area_ratio < 0.005:
            continue

        # Only keep high-confidence masks
        if scores[i] < 0.7:
            continue

        binary = (mask.astype(np.uint8)) * 255
        room_masks.append(binary)

    return room_masks


def is_sam3_available() -> bool:
    """Check whether SAM 3 is installed and usable."""
    return SAM3_AVAILABLE
```

- [ ] **Step 2: Commit**

```bash
git add geometry-service/app/segment.py
git commit -m "feat(geometry): add SAM 3 text-prompted segmentation module"
```

---

## Task 4: Python Geometry Service — FastAPI Endpoint

**Files:**
- Create: `geometry-service/app/main.py`
- Create: `geometry-service/tests/test_api.py`
- Create: `geometry-service/Dockerfile`

- [ ] **Step 1: Write failing API test**

```python
# geometry-service/tests/test_api.py
import cv2
import io
import numpy as np
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
def simple_floorplan_bytes(simple_floorplan: np.ndarray) -> bytes:
    """Encode the synthetic floor plan fixture as JPEG bytes."""
    _, buf = cv2.imencode(".jpg", simple_floorplan)
    return buf.tobytes()


@pytest.mark.anyio
async def test_extract_geometry_returns_polygons(simple_floorplan_bytes: bytes):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/extract-geometry",
            files={"image": ("plan.jpg", simple_floorplan_bytes, "image/jpeg")},
        )

    assert response.status_code == 200
    data = response.json()
    assert "polygons" in data
    assert len(data["polygons"]) == 4
    assert "image_width" in data
    assert "image_height" in data


@pytest.mark.anyio
async def test_extract_geometry_fails_on_blank_image(empty_image: np.ndarray):
    _, buf = cv2.imencode(".jpg", empty_image)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/extract-geometry",
            files={"image": ("blank.jpg", buf.tobytes(), "image/jpeg")},
        )

    assert response.status_code == 422
    data = response.json()
    assert "error" in data


@pytest.mark.anyio
async def test_extract_geometry_rejects_missing_file():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/extract-geometry")

    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd geometry-service && pip install anyio httpx && pytest tests/test_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 3: Implement FastAPI endpoint**

```python
# geometry-service/app/main.py
import logging
import time
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from .preprocess import detect_walls, close_gaps
from .polygons import extract_room_polygons, compute_adjacency
from .segment import is_sam3_available, segment_rooms_sam3
from .types import GeometryResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CoolBid Geometry Service")


@app.post("/extract-geometry", response_model=GeometryResult)
async def extract_geometry(image: UploadFile = File(...)) -> GeometryResult:
    """Extract room polygons from a floor plan image.

    Returns normalized (0-1) room polygons with bounding boxes,
    centroids, and adjacency data.
    """
    start = time.monotonic()

    # Read and decode image
    contents = await image.read()
    arr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=422, detail={"error": "Could not decode image"})

    h, w = img.shape[:2]
    logger.info("Processing image: %dx%d", w, h)

    # Stage 1: Pre-processing
    t0 = time.monotonic()
    wall_mask = detect_walls(img)
    closed = close_gaps(wall_mask, gap_size=15)
    logger.info("Pre-processing: %.2fs", time.monotonic() - t0)

    # Stage 2: Segmentation
    # Use SAM 3 if available, otherwise fall back to contour-based
    t1 = time.monotonic()
    if is_sam3_available():
        logger.info("Using SAM 3 segmentation")
        room_masks = segment_rooms_sam3(img)
        # Merge SAM masks into a combined closed mask for polygon extraction
        if room_masks:
            combined = np.zeros_like(closed)
            for mask in room_masks:
                combined = cv2.bitwise_or(combined, cv2.bitwise_not(mask))
            closed = combined
    logger.info("Segmentation: %.2fs", time.monotonic() - t1)

    # Stage 3: Polygon extraction
    t2 = time.monotonic()
    polygons = extract_room_polygons(closed, image_width=w, image_height=h)
    logger.info("Polygon extraction: %d polygons in %.2fs", len(polygons), time.monotonic() - t2)

    if len(polygons) == 0:
        raise HTTPException(
            status_code=422,
            detail={"error": "Could not detect room boundaries in floor plan"},
        )

    # Stage 4: Adjacency
    t3 = time.monotonic()
    polygons = compute_adjacency(polygons)
    adj_count = sum(len(p.adjacent_to) for p in polygons)
    logger.info("Adjacency: %d edges in %.2fs", adj_count, time.monotonic() - t3)

    total = time.monotonic() - start
    logger.info("Total processing: %.2fs", total)

    return GeometryResult(polygons=polygons, image_width=w, image_height=h)


@app.get("/health")
async def health():
    return {"status": "ok", "sam3_available": is_sam3_available()}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd geometry-service && pytest tests/test_api.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Create Dockerfile**

```dockerfile
# geometry-service/Dockerfile
FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir . ".[gpu]"

# Download SAM 3 model weights during build
# Download SAM 3 model weights — verify URL against current sam3 repo releases
RUN mkdir -p /models && \
    python3 -c "import urllib.request; urllib.request.urlretrieve( \
        'https://dl.fbaipublicfiles.com/segment_anything_3/sam3_hiera_large.pt', \
        '/models/sam3_hiera_large.pt')"

COPY app/ app/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 6: Commit**

```bash
git add geometry-service/app/main.py geometry-service/tests/test_api.py geometry-service/Dockerfile
git commit -m "feat(geometry): add FastAPI endpoint and Dockerfile"
```

---

## Task 5: TypeScript Types + Zod Schema Changes

**Files:**
- Modify: `src/types/hvac.ts`
- Modify: `src/lib/analyze/schema.ts`

- [ ] **Step 1: Add spatial fields to Room type**

In `src/types/hvac.ts`, add the required spatial fields to `Room`:

```typescript
// src/types/hvac.ts — updated Room type
export type Room = {
  name: string; type: RoomType; floor: number; estimated_sqft: number;
  width_ft: number; length_ft: number; window_count: number;
  exterior_walls: number; ceiling_height: number; notes: string;
  unit?: number;
  polygon_id: string;
  bbox: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
  adjacent_rooms: string[];
};
```

- [ ] **Step 2: Add Zod schemas for spatial fields**

In `src/lib/analyze/schema.ts`, update `RoomSchema` to include the new fields:

```typescript
// Add to RoomSchema — after the `unit` field:
  polygon_id: z.string().min(1),
  bbox: z.object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
    width: z.coerce.number().min(0).max(1),
    height: z.coerce.number().min(0).max(1),
  }),
  centroid: z.object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
  }),
  adjacent_rooms: z.array(z.string()).default([]),
```

- [ ] **Step 3: Run type check to verify no compilation errors**

Run: `npx tsc --noEmit`
Expected: Compilation errors in files that construct `Room` objects without the new fields. This is expected — we'll fix them in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add src/types/hvac.ts src/lib/analyze/schema.ts
git commit -m "feat(types): add required spatial fields to Room type and Zod schema"
```

---

## Task 6: Database Migration

**Files:**
- Create: `supabase/migrations/012_room_geometry.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/012_room_geometry.sql
-- Add spatial columns for room geometry extracted by the floor plan geometry service.
-- Columns are nullable at DB level so existing rows survive. Application code
-- enforces required-ness for new estimates via Zod schema.

ALTER TABLE estimate_rooms ADD COLUMN bbox_x         NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_y         NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_width     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_height    NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN centroid_x     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN centroid_y     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN adjacent_rooms TEXT[] DEFAULT '{}';
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `npx supabase db push --local` (or however migrations are applied in this project)
Expected: Migration applies without errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_room_geometry.sql
git commit -m "feat(db): add spatial columns to estimate_rooms for room geometry"
```

---

## Task 7: Geometry Service Client in Next.js

**Files:**
- Create: `src/lib/geometry/client.ts`
- Create: `src/lib/geometry/__tests__/client.test.ts`

- [ ] **Step 1: Write failing test for the geometry client**

```typescript
// src/lib/geometry/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractGeometry, GeometryServiceError } from "../client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const MOCK_POLYGONS = [
  {
    id: "room_0",
    vertices: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ],
    bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
    centroid: { x: 0.3, y: 0.3 },
    area: 0.16,
    adjacent_to: [{ room_id: "room_1", shared_edge: "right" }],
  },
  {
    id: "room_1",
    vertices: [
      { x: 0.5, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ],
    bbox: { x: 0.5, y: 0.1, width: 0.4, height: 0.4 },
    centroid: { x: 0.7, y: 0.3 },
    area: 0.16,
    adjacent_to: [{ room_id: "room_0", shared_edge: "left" }],
  },
];

describe("extractGeometry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GEOMETRY_SERVICE_URL = "http://localhost:8000";
  });

  it("returns polygons on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        polygons: MOCK_POLYGONS,
        image_width: 800,
        image_height: 600,
      }),
    });

    const result = await extractGeometry(Buffer.from("fake-image"), "image/jpeg");

    expect(result.polygons).toHaveLength(2);
    expect(result.polygons[0].id).toBe("room_0");
    expect(result.polygons[0].bbox.x).toBe(0.1);
  });

  it("throws GeometryServiceError on 422", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: { error: "Could not detect room boundaries" } }),
    });

    await expect(extractGeometry(Buffer.from("blank"), "image/jpeg")).rejects.toThrow(
      GeometryServiceError,
    );
  });

  it("throws GeometryServiceError when service is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(extractGeometry(Buffer.from("img"), "image/jpeg")).rejects.toThrow(
      GeometryServiceError,
    );
  });

  it("throws when GEOMETRY_SERVICE_URL is not set", async () => {
    delete process.env.GEOMETRY_SERVICE_URL;

    await expect(extractGeometry(Buffer.from("img"), "image/jpeg")).rejects.toThrow(
      "GEOMETRY_SERVICE_URL",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/geometry/__tests__/client.test.ts`
Expected: FAIL with `Cannot find module '../client'`

- [ ] **Step 3: Implement geometry client**

```typescript
// src/lib/geometry/client.ts
export type RoomPolygon = {
  id: string;
  vertices: { x: number; y: number }[];
  bbox: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
  area: number;
  adjacent_to: { room_id: string; shared_edge: string }[];
};

export type GeometryResult = {
  polygons: RoomPolygon[];
  image_width: number;
  image_height: number;
};

export class GeometryServiceError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "GeometryServiceError";
  }
}

export async function extractGeometry(
  imageBuffer: Buffer,
  mediaType: string,
): Promise<GeometryResult> {
  const baseUrl = process.env.GEOMETRY_SERVICE_URL?.trim();
  if (!baseUrl) {
    throw new GeometryServiceError("GEOMETRY_SERVICE_URL environment variable is not set");
  }

  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: mediaType });
  formData.append("image", blob, `floorplan.${mediaType.split("/")[1] || "jpg"}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/extract-geometry`, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    throw new GeometryServiceError(
      `Floor plan geometry service unavailable: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  if (!response.ok) {
    let detail = "Geometry extraction failed";
    try {
      const body = await response.json();
      detail = body?.detail?.error ?? body?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new GeometryServiceError(detail, response.status);
  }

  return (await response.json()) as GeometryResult;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/geometry/__tests__/client.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/client.ts src/lib/geometry/__tests__/client.test.ts
git commit -m "feat(geometry): add TypeScript client for geometry service"
```

---

## Task 8: Claude Prompt Modifications

**Files:**
- Modify: `src/lib/anthropic.ts`

- [ ] **Step 1: Add geometry-aware prompt constant**

Add a new prompt that instructs Claude to label detected polygons. Append this after the existing `DOCAI_HYBRID_PROMPT` in `src/lib/anthropic.ts`:

```typescript
/* ── Geometry-aware prompt: labels detected room polygons ─────────── */

export const GEOMETRY_LABELING_PROMPT = `You are analyzing a floor plan image. A geometry extraction service has already detected room boundaries as polygons. Your job is to LABEL each polygon and fill in room attributes.

You have THREE sources of information:
1. **The floor plan image(s) above** — use to identify room labels, windows, exterior walls
2. **The OCR text below** — use for accurate text readings of dimensions, labels, notes
3. **The detected room polygons below** — each polygon has an id, bounding box (normalized 0-1), and centroid

**Your task for each polygon:**
1. Look at the floor plan image near the polygon's centroid/bounding box
2. Identify the room label text visible at that location
3. Read dimension annotations near the polygon's edges to determine width_ft and length_ft
4. Count windows visible in that polygon's walls
5. Determine how many walls are exterior (thick outer walls)
6. Note ceiling height if annotated, otherwise default to 9 ft

**Important rules:**
- Every polygon MUST be assigned a room name and type. If you cannot find a label, infer from context (e.g., a small polygon between bedrooms with no label is likely a hallway or closet).
- The polygon_id in your output MUST match the id from the detected polygons.
- The bbox and centroid values in your output MUST be copied exactly from the detected polygons — do not modify them.
- The adjacent_rooms array should contain the room NAMES (not polygon IDs) of adjacent rooms, derived from the adjacency data provided.
- If you see a labeled room on the floor plan that does NOT have a corresponding polygon, add it to the "unmatched_labels" array in analysis_notes.
- Read dimension annotations from OCR text first, then check images for rotated text OCR missed.
- Verify room sqft sum is within 10% of total building sqft.

Return a single valid JSON object:
{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {
    "stories": number,
    "total_sqft": number,
    "units": number,
    "has_garage": boolean,
    "building_shape": "string",
    "unit_sqft": [number]
  },
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "enum value",
      "floor": number,
      "unit": number,
      "estimated_sqft": number,
      "width_ft": number,
      "length_ft": number,
      "window_count": number,
      "exterior_walls": number,
      "ceiling_height": number,
      "notes": "string",
      "polygon_id": "room_0",
      "bbox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.25},
      "centroid": {"x": 0.25, "y": 0.325},
      "adjacent_rooms": ["Kitchen", "Hallway"]
    }
  ],
  "hvac_notes": {
    "suggested_equipment_location": "string",
    "suggested_zones": number,
    "special_considerations": ["string"]
  },
  "analysis_notes": "string"
}

Your entire response must be valid JSON with no markdown, no explanation, no code fences.

--- DETECTED POLYGONS ---
`;
```

- [ ] **Step 2: Add helper to format polygons for the prompt**

Add this helper function in `src/lib/anthropic.ts`:

```typescript
import type { RoomPolygon } from "@/lib/geometry/client";

/** Format detected polygons as text for the Claude prompt. */
export function formatPolygonsForPrompt(
  polygonsByFloor: { floor: number; polygons: RoomPolygon[] }[],
): string {
  const sections: string[] = [];
  for (const { floor, polygons } of polygonsByFloor) {
    sections.push(`\n[Floor ${floor}]`);
    for (const p of polygons) {
      const adj = p.adjacent_to
        .map((a) => `${a.room_id} (${a.shared_edge})`)
        .join(", ");
      sections.push(
        `  ${p.id}: bbox(x=${p.bbox.x.toFixed(3)}, y=${p.bbox.y.toFixed(3)}, w=${p.bbox.width.toFixed(3)}, h=${p.bbox.height.toFixed(3)}) centroid(${p.centroid.x.toFixed(3)}, ${p.centroid.y.toFixed(3)}) area=${p.area.toFixed(4)}${adj ? ` adjacent=[${adj}]` : ""}`,
      );
    }
  }
  return sections.join("\n");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/anthropic.ts
git commit -m "feat(prompts): add geometry-aware labeling prompt for detected polygons"
```

---

## Task 9: API Route Changes

**Files:**
- Modify: `src/app/api/analyze-docai/route.ts`
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Update analyze-docai route**

In `src/app/api/analyze-docai/route.ts`:

1. Import the geometry client and new prompt:
```typescript
import { extractGeometry, GeometryServiceError } from "@/lib/geometry/client";
import { GEOMETRY_LABELING_PROMPT, formatPolygonsForPrompt } from "@/lib/anthropic";
```

2. Change `maxDuration`:
```typescript
export const maxDuration = 180;
```

3. After reading the file buffer and before building Claude content, call the geometry service for each selected page. Add this after the `ocrResult` check (line ~123):

```typescript
  // Run geometry extraction on each page image
  type PolygonsByFloor = { floor: number; polygons: import("@/lib/geometry/client").RoomPolygon[] };
  const polygonsByFloor: PolygonsByFloor[] = [];

  for (const img of images) {
    const imageBuffer = Buffer.from(img.base64, "base64");
    try {
      const geometry = await extractGeometry(imageBuffer, img.mediaType);
      polygonsByFloor.push({
        floor: img.pageNum ?? polygonsByFloor.length + 1,
        polygons: geometry.polygons,
      });
    } catch (err) {
      if (err instanceof GeometryServiceError) {
        return NextResponse.json(
          { error: err.message, code: "geometry_failed" },
          { status: 422 },
        );
      }
      throw err;
    }
  }
```

4. Replace the prompt selection logic (currently lines ~144-146) to use the geometry-aware prompt:

```typescript
  // Build prompt with geometry data
  const polygonText = formatPolygonsForPrompt(polygonsByFloor);
  const prompt = GEOMETRY_LABELING_PROMPT + polygonText
    + "\n\n--- OCR TEXT ---\n" + ocrResult.text
    + buildConstraints(buildingInfo);
  content.push({ type: "text", text: prompt });
```

- [ ] **Step 2: Update analyze route (vision-only path)**

In `src/app/api/analyze/route.ts`:

1. Import the geometry client and new prompt:
```typescript
import { extractGeometry, GeometryServiceError } from "@/lib/geometry/client";
import { GEOMETRY_LABELING_PROMPT, formatPolygonsForPrompt } from "@/lib/anthropic";
```

2. Change `maxDuration`:
```typescript
export const maxDuration = 180;
```

3. In the `POST` handler, after parsing images and before the analysis calls, add geometry extraction:

```typescript
  // Extract geometry from each page
  type PolygonsByFloor = { floor: number; polygons: import("@/lib/geometry/client").RoomPolygon[] };
  const polygonsByFloor: PolygonsByFloor[] = [];

  for (const img of images) {
    const imageBuffer = Buffer.from(img.base64, "base64");
    try {
      const geometry = await extractGeometry(imageBuffer, img.mediaType);
      polygonsByFloor.push({
        floor: img.pageNum ?? polygonsByFloor.length + 1,
        polygons: geometry.polygons,
      });
    } catch (err) {
      if (err instanceof GeometryServiceError) {
        return NextResponse.json(
          { error: err.message, code: "geometry_failed" },
          { status: 422 },
        );
      }
      throw err;
    }
  }
```

4. Update `singlePassAnalysis` and `twoPassAnalysis` to accept `polygonsByFloor` and use the geometry-aware prompt:

```typescript
async function singlePassAnalysis(
  imageContent: Anthropic.Messages.ContentBlockParam[],
  buildingInfo: z.infer<typeof RequestSchema>["buildingInfo"],
  polygonsByFloor: { floor: number; polygons: import("@/lib/geometry/client").RoomPolygon[] }[],
): Promise<string> {
  const polygonText = formatPolygonsForPrompt(polygonsByFloor);
  const userPrompt = GEOMETRY_LABELING_PROMPT + polygonText + buildConstraints(buildingInfo);
  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...imageContent,
    { type: "text", text: userPrompt },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  return extractTextFromResponse(response);
}
```

```typescript
async function twoPassAnalysis(
  imageContent: Anthropic.Messages.ContentBlockParam[],
  buildingInfo: z.infer<typeof RequestSchema>["buildingInfo"],
  polygonsByFloor: { floor: number; polygons: import("@/lib/geometry/client").RoomPolygon[] }[],
): Promise<string> {
  // Pass 1: Raw annotation extraction (unchanged — still extracts text)
  const pass1Content: Anthropic.Messages.ContentBlockParam[] = [
    ...imageContent,
    { type: "text", text: PASS1_EXTRACTION_PROMPT + buildConstraints(buildingInfo) },
  ];

  const pass1Response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    thinking: { type: "enabled", budget_tokens: 10000 },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: pass1Content }],
  });

  const rawExtraction = extractTextFromResponse(pass1Response);

  // Pass 2: Structure with geometry data
  const polygonText = formatPolygonsForPrompt(polygonsByFloor);
  const pass2Prompt = GEOMETRY_LABELING_PROMPT + polygonText
    + "\n\n--- RAW EXTRACTION ---\n" + rawExtraction;

  const pass2Response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    system: "You are an expert HVAC engineer structuring floor plan data into JSON for load calculations.",
    messages: [{ role: "user", content: pass2Prompt }],
  });

  return extractTextFromResponse(pass2Response);
}
```

5. Update the call sites to pass `polygonsByFloor`:

```typescript
  if (shouldUseTwoPass(images.length, buildingInfo?.totalSqft)) {
    rawText = await twoPassAnalysis(imageContent, buildingInfo, polygonsByFloor);
  } else {
    rawText = await singlePassAnalysis(imageContent, buildingInfo, polygonsByFloor);
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/analyze-docai/route.ts src/app/api/analyze/route.ts
git commit -m "feat(api): integrate geometry service into analyze routes"
```

---

## Task 10: Validation — Add Geometry Checks

**Files:**
- Modify: `src/lib/analyze/validate-analysis.ts`

- [ ] **Step 1: Add geometry validation to validateAnalysis**

Add polygon-room consistency checks after the existing duplicate detection block (after line ~50):

```typescript
  // Geometry validation: every room must have spatial data
  for (const room of rooms) {
    if (!room.polygon_id) {
      warnings.push(`Room "${room.name}": missing polygon_id — geometry extraction may have failed`);
    }
    if (!room.bbox || room.bbox.width <= 0 || room.bbox.height <= 0) {
      warnings.push(`Room "${room.name}": invalid or missing bbox`);
    }
  }

  // Check for duplicate polygon_ids
  const polygonIds = rooms.map((r) => r.polygon_id).filter(Boolean);
  const uniquePolygonIds = new Set(polygonIds);
  if (polygonIds.length !== uniquePolygonIds.size) {
    warnings.push("Multiple rooms reference the same polygon_id — geometry/label mismatch");
    confidence = "low";
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/analyze/validate-analysis.ts
git commit -m "feat(validate): add geometry validation checks for spatial data"
```

---

## Task 11: Replace Treemap Layout with Real Positions

**Files:**
- Modify: `src/lib/hvac/floorplan-layout.ts`
- Delete: `src/lib/hvac/__tests__/floorplan-layout.test.ts`
- Create: `src/lib/hvac/__tests__/floorplan-layout-geometry.test.ts`

- [ ] **Step 1: Write failing tests for real-position layout**

```typescript
// src/lib/hvac/__tests__/floorplan-layout-geometry.test.ts
import { describe, it, expect } from "vitest";
import { generateFloorplanLayout } from "../floorplan-layout";
import type { RoomLoad, BomSummary } from "@/types/hvac";

function makeRoom(overrides: Partial<RoomLoad> = {}): RoomLoad {
  return {
    name: "Living Room",
    type: "living_room",
    floor: 1,
    estimated_sqft: 300,
    width_ft: 15,
    length_ft: 20,
    window_count: 2,
    exterior_walls: 2,
    ceiling_height: 9,
    notes: "",
    btu: 8000,
    cfm: 300,
    regs: 2,
    polygon_id: "room_0",
    bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
    centroid: { x: 0.3, y: 0.3 },
    adjacent_rooms: ["Kitchen"],
    ...overrides,
  };
}

const baseSummary: BomSummary = {
  designBTU: 42000,
  tonnage: 3.5,
  totalCFM: 1200,
  totalRegs: 8,
  retCount: 3,
  condSqft: 1200,
  zones: 1,
};

describe("generateFloorplanLayout (real positions)", () => {
  const rooms: RoomLoad[] = [
    makeRoom({
      name: "Living Room",
      type: "living_room",
      estimated_sqft: 320,
      regs: 2,
      polygon_id: "room_0",
      bbox: { x: 0.05, y: 0.05, width: 0.45, height: 0.45 },
      centroid: { x: 0.275, y: 0.275 },
      adjacent_rooms: ["Kitchen", "Hallway"],
    }),
    makeRoom({
      name: "Kitchen",
      type: "kitchen",
      estimated_sqft: 210,
      regs: 1,
      polygon_id: "room_1",
      bbox: { x: 0.5, y: 0.05, width: 0.45, height: 0.45 },
      centroid: { x: 0.725, y: 0.275 },
      adjacent_rooms: ["Living Room", "Bedroom 2"],
    }),
    makeRoom({
      name: "Master Bedroom",
      type: "master_bedroom",
      estimated_sqft: 250,
      regs: 2,
      polygon_id: "room_2",
      bbox: { x: 0.05, y: 0.5, width: 0.45, height: 0.45 },
      centroid: { x: 0.275, y: 0.725 },
      adjacent_rooms: ["Living Room"],
    }),
    makeRoom({
      name: "Bedroom 2",
      type: "bedroom",
      estimated_sqft: 160,
      regs: 1,
      polygon_id: "room_3",
      bbox: { x: 0.5, y: 0.5, width: 0.45, height: 0.45 },
      centroid: { x: 0.725, y: 0.725 },
      adjacent_rooms: ["Kitchen"],
    }),
  ];

  it("maps rooms to SVG coordinates from bbox data", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);

    // Living room bbox starts at 0.05 — should map to near the left edge
    const living = layout.rooms.find((r) => r.name === "Living Room")!;
    expect(living.x).toBeGreaterThan(0);
    expect(living.x).toBeLessThan(200);

    // Kitchen bbox starts at 0.5 — should map to right half
    const kitchen = layout.rooms.find((r) => r.name === "Kitchen")!;
    expect(kitchen.x).toBeGreaterThan(150);
  });

  it("preserves relative room positions", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);

    const living = layout.rooms.find((r) => r.name === "Living Room")!;
    const kitchen = layout.rooms.find((r) => r.name === "Kitchen")!;
    const master = layout.rooms.find((r) => r.name === "Master Bedroom")!;
    const bed2 = layout.rooms.find((r) => r.name === "Bedroom 2")!;

    // Kitchen should be to the right of Living Room
    expect(kitchen.x).toBeGreaterThan(living.x);

    // Master should be below Living Room
    expect(master.y).toBeGreaterThan(living.y);

    // Bedroom 2 should be below Kitchen
    expect(bed2.y).toBeGreaterThan(kitchen.y);
  });

  it("all rooms fit within the SVG viewbox", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);

    for (const room of layout.rooms) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.y).toBeGreaterThanOrEqual(0);
      expect(room.x + room.width).toBeLessThanOrEqual(layout.viewBox.width);
      expect(room.y + room.height).toBeLessThanOrEqual(layout.viewBox.height);
    }
  });

  it("places register dots within room bounds", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    for (const room of layout.rooms) {
      for (const pos of room.registerPositions) {
        expect(pos.x).toBeGreaterThanOrEqual(room.x);
        expect(pos.x).toBeLessThanOrEqual(room.x + room.width);
        expect(pos.y).toBeGreaterThanOrEqual(room.y);
        expect(pos.y).toBeLessThanOrEqual(room.y + room.height);
      }
    }
  });

  it("generates trunk and branch duct segments", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    const trunks = layout.ducts.filter((d) => d.type === "trunk");
    const branches = layout.ducts.filter((d) => d.type === "branch");

    expect(trunks.length).toBeGreaterThanOrEqual(1);
    expect(branches.length).toBeGreaterThanOrEqual(1);
  });

  it("returns valid viewBox dimensions", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    expect(layout.viewBox.width).toBe(400);
    expect(layout.viewBox.height).toBe(300);
  });

  it("excludes garage and closet from layout", () => {
    const withGarage = [
      ...rooms,
      makeRoom({
        name: "Garage",
        type: "garage",
        cfm: 0,
        regs: 0,
        btu: 0,
        polygon_id: "room_4",
        bbox: { x: 0.0, y: 0.0, width: 0.2, height: 0.2 },
        centroid: { x: 0.1, y: 0.1 },
        adjacent_rooms: [],
      }),
    ];
    const layout = generateFloorplanLayout(withGarage, baseSummary);
    expect(layout.rooms.map((r) => r.name)).not.toContain("Garage");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hvac/__tests__/floorplan-layout-geometry.test.ts`
Expected: FAIL (test fixtures have new required fields that the current implementation doesn't handle)

- [ ] **Step 3: Rewrite floorplan-layout.ts — delete treemap, use real positions**

Replace the entire contents of `src/lib/hvac/floorplan-layout.ts`:

```typescript
// src/lib/hvac/floorplan-layout.ts
import type { RoomLoad, BomSummary, HvacNotes } from "@/types/hvac";
import type { FloorplanLayout, LayoutRoom, DuctSegment } from "@/types/duct-layout";
import { needsReturnRegister } from "./load-calc";

const SVG_WIDTH = 400;
const SVG_HEIGHT = 300;
const PADDING = 30;

// ── Real-Position Layout ───────────────────────────────────────────

function mapBboxToSvg(bbox: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const innerW = SVG_WIDTH - PADDING * 2;
  const innerH = SVG_HEIGHT - PADDING * 2;

  return {
    x: PADDING + bbox.x * innerW,
    y: PADDING + bbox.y * innerH,
    width: Math.max(bbox.width * innerW, 4),
    height: Math.max(bbox.height * innerH, 4),
  };
}

// ── Register Placement ─────────────────────────────────────────────

function placeRegisters(
  room: { x: number; y: number; width: number; height: number },
  count: number,
): { x: number; y: number }[] {
  if (count === 0) return [];
  const inset = Math.min(room.width, room.height) * 0.2;
  const innerW = room.width - inset * 2;
  const innerH = room.height - inset * 2;

  if (count === 1) {
    return [{ x: room.x + room.width / 2, y: room.y + room.height / 2 }];
  }

  const cols = Math.ceil(Math.sqrt(count * (innerW / innerH)));
  const rows = Math.ceil(count / cols);
  const positions: { x: number; y: number }[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = room.x + inset + (cols > 1 ? (col / (cols - 1)) * innerW : innerW / 2);
    const y = room.y + inset + (rows > 1 ? (row / (rows - 1)) * innerH : innerH / 2);
    positions.push({ x, y });
  }

  return positions;
}

// ── Duct Routing ───────────────────────────────────────────────────

function getTrunkSize(tonnage: number): string {
  if (tonnage <= 3) return '8"×12"';
  if (tonnage <= 4) return '10"×14"';
  return '12"×16"';
}

function getFlexSize(sqft: number): string {
  return sqft >= 250 ? '8" flex' : '6" flex';
}

function routeDucts(
  layoutRooms: LayoutRoom[],
  equipment: { x: number; y: number },
  tonnage: number,
): DuctSegment[] {
  const segments: DuctSegment[] = [];
  const trunkSize = getTrunkSize(tonnage);

  // Find the trunk Y: the horizontal center-of-mass of all rooms
  const totalArea = layoutRooms.reduce((s, r) => s + r.width * r.height, 0);
  const trunkY = totalArea > 0
    ? layoutRooms.reduce((s, r) => s + (r.y + r.height / 2) * (r.width * r.height), 0) / totalArea
    : SVG_HEIGHT / 2;

  // Trunk span: leftmost room edge to rightmost room edge
  const leftEdge = Math.min(...layoutRooms.map((r) => r.x));
  const rightEdge = Math.max(...layoutRooms.map((r) => r.x + r.width));

  // Vertical drop from equipment to trunk
  segments.push({
    from: equipment,
    to: { x: equipment.x, y: trunkY },
    type: "trunk",
    size: trunkSize,
  });

  // Horizontal trunk line
  segments.push({
    from: { x: leftEdge, y: trunkY },
    to: { x: rightEdge, y: trunkY },
    type: "trunk",
    size: trunkSize,
  });

  // Branches from trunk to each room
  for (const room of layoutRooms) {
    const roomCenterX = room.x + room.width / 2;
    const flexSize = getFlexSize(room.sqft);

    const roomTop = room.y;
    const roomBottom = room.y + room.height;
    const branchEndY = Math.abs(roomTop - trunkY) < Math.abs(roomBottom - trunkY)
      ? roomTop + 4
      : roomBottom - 4;

    segments.push({
      from: { x: roomCenterX, y: trunkY },
      to: { x: roomCenterX, y: branchEndY },
      type: "branch",
      size: flexSize,
    });
  }

  return segments;
}

// ── Main Generator ─────────────────────────────────────────────────

export function generateFloorplanLayout(
  roomLoads: RoomLoad[],
  summary: BomSummary,
  hvacNotes?: HvacNotes,
): FloorplanLayout {
  // Filter out non-conditioned spaces
  const conditioned = roomLoads.filter(
    (r) => r.type !== "garage" && r.type !== "closet" && r.cfm > 0,
  );

  // Map rooms using their real bbox positions
  const layoutRooms: LayoutRoom[] = conditioned.map((room, i) => {
    const svgRect = mapBboxToSvg(room.bbox);

    return {
      id: room.polygon_id || `room-${i}`,
      name: room.name,
      type: room.type,
      x: svgRect.x,
      y: svgRect.y,
      width: svgRect.width,
      height: svgRect.height,
      sqft: room.estimated_sqft,
      cfm: room.cfm,
      regs: room.regs,
      hasReturn: needsReturnRegister(room),
      registerPositions: placeRegisters(svgRect, room.regs),
    };
  });

  // Equipment placement based on suggested location
  const location = hvacNotes?.suggested_equipment_location?.toLowerCase() ?? "";
  const isAttic = location.includes("attic");
  const equipX = SVG_WIDTH / 2;
  const equipY = isAttic ? 15 : SVG_HEIGHT - 15;
  const equipLabel = isAttic ? "Attic Unit" : location.includes("garage") ? "Garage Unit" : "Equipment";
  const equipment = { x: equipX, y: equipY, label: equipLabel };

  // Route ducts
  const ducts = routeDucts(layoutRooms, equipment, summary.tonnage);

  return {
    rooms: layoutRooms,
    ducts,
    equipment,
    viewBox: { width: SVG_WIDTH, height: SVG_HEIGHT },
  };
}
```

- [ ] **Step 4: Delete old test file**

Delete `src/lib/hvac/__tests__/floorplan-layout.test.ts` — it tests the treemap algorithm which no longer exists.

- [ ] **Step 5: Run new tests to verify they pass**

Run: `npx vitest run src/lib/hvac/__tests__/floorplan-layout-geometry.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git rm src/lib/hvac/__tests__/floorplan-layout.test.ts
git add src/lib/hvac/floorplan-layout.ts src/lib/hvac/__tests__/floorplan-layout-geometry.test.ts
git commit -m "feat(layout): replace treemap with real-position rendering from geometry data"
```

---

## Task 12: Update Analyzing Step UI

**Files:**
- Modify: `src/components/estimator/analyzing-step.tsx`

- [ ] **Step 1: Update progress step labels**

In `src/components/estimator/analyzing-step.tsx`, update the `STEPS` array to reflect the new geometry pipeline:

```typescript
const STEPS = [
  "Scanning document with OCR...",
  "Extracting room boundaries from floor plan...",
  "Detecting walls and computing adjacency...",
  "Reading dimension annotations...",
  "Labeling rooms and matching polygons...",
  "Computing heat load requirements...",
  "Generating room report...",
];
```

- [ ] **Step 2: Update error handling for geometry failures**

In the `analyze()` function, update the error handling in `tryDocumentAi` to surface geometry-specific errors. After the `res.ok` check (~line 141):

```typescript
        if (!res.ok) {
          if (res.status === 402) {
            const err = await res.json().catch(() => ({ error: "Analysis failed" }));
            throw new Error((err as { error?: string }).error ?? "Analysis failed");
          }
          if (res.status === 422) {
            const err = await res.json().catch(() => ({ error: "Analysis failed" }));
            const errorMsg = (err as { error?: string }).error ?? "Analysis failed";
            // Geometry failures should surface to the user, not silently fall back
            if ((err as { code?: string }).code === "geometry_failed") {
              throw new Error(errorMsg);
            }
          }
          return null;
        }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/estimator/analyzing-step.tsx
git commit -m "feat(ui): update analyzing step labels and geometry error handling"
```

---

## Task 13: Update Room Insert Logic for Spatial Fields

**Files:**
- Check and modify: wherever `estimate_rooms` rows are inserted (likely in the estimator flow after analysis)

- [ ] **Step 1: Find where rooms are inserted into the database**

Run: `grep -rn "estimate_rooms" src/ --include="*.ts" --include="*.tsx"` to find all insert/upsert locations.

- [ ] **Step 2: Update the insert to include spatial columns**

Wherever rooms are inserted, add the new columns:

```typescript
  bbox_x: room.bbox.x,
  bbox_y: room.bbox.y,
  bbox_width: room.bbox.width,
  bbox_height: room.bbox.height,
  centroid_x: room.centroid.x,
  centroid_y: room.centroid.y,
  adjacent_rooms: room.adjacent_rooms,
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): persist spatial fields when saving estimate rooms"
```

---

## Task 14: Full Integration Verification

- [ ] **Step 1: Run all TypeScript tests**

Run: `npx vitest run`
Expected: All tests pass (geometry client, layout, existing tests)

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run Python geometry tests**

Run: `cd geometry-service && pytest -v`
Expected: All tests pass

- [ ] **Step 4: Start dev server and manually test with a floor plan**

Run: `npm run dev`

1. Upload a floor plan PDF
2. Verify the progress steps show the new labels (extracting room boundaries, computing adjacency, etc.)
3. Verify the analysis completes and rooms have spatial data
4. Verify the schematic shows rooms in their actual positions (not treemap arrangement)
5. Verify duct routing follows real room positions

Note: This requires the geometry service to be running locally (`cd geometry-service && uvicorn app.main:app --port 8000`) and `GEOMETRY_SERVICE_URL=http://localhost:8000` set in `.env.local`.

- [ ] **Step 5: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: integration test fixes for geometry pipeline"
```
