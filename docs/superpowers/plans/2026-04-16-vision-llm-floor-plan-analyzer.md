# Vision-LLM Floor Plan Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the OpenCV + SAM3 geometry-extraction pipeline with a vision-LLM pipeline that produces room polygons directly from the floor plan image, hosted on Modal. The existing `FloorplanCanvas` UI stays exactly as-is.

**Architecture:** A single Modal FastAPI service does everything: image preprocessing (resize + CLAHE contrast) → Anthropic Claude Sonnet 4 vision call that returns rooms *with polygon vertices* → shapely-based polygon validation and sqft computation. The Next.js `/api/analyze` route becomes a thin auth/billing/validation proxy; `src/lib/anthropic.ts` and the geometry-labeling prompts are deleted. The existing Zod `AnalysisResultSchema` already supports `vertices` and does all type normalization — no UI or schema changes needed.

**Tech Stack:**
- Modal (CPU-only, no GPU) + FastAPI
- Python: `anthropic`, `opencv-python-headless`, `numpy`, `shapely`, `Pillow`, `pydantic`
- Next.js 16 App Router route handler + Zod validation
- Claude Sonnet 4 (`claude-sonnet-4-20250514`) with extended thinking

---

## File Structure

**New files:**
- `geometry-service/app/prompts.py` — vision LLM prompt constants
- `geometry-service/app/vision.py` — Anthropic client wrapper + JSON extraction
- `geometry-service/app/postprocess.py` — shapely polygon validation/simplification
- `geometry-service/tests/test_postprocess.py` — unit tests for postprocess
- `geometry-service/tests/test_preprocess_new.py` — unit tests for new preprocess
- `src/lib/analyzer/client.ts` — new thin Modal client

**Modified files:**
- `geometry-service/pyproject.toml` — swap deps (drop torch/sam3, add anthropic/shapely/pillow)
- `geometry-service/modal_app.py` — CPU-only image, add anthropic secret
- `geometry-service/app/main.py` — replace `/extract-geometry` with `/analyze`
- `geometry-service/app/types.py` — add `AnalysisResponse` Pydantic schema
- `geometry-service/app/preprocess.py` — rewrite: resize + CLAHE (drop wall detection)
- `geometry-service/tests/test_api.py` — rewrite for `/analyze`
- `geometry-service/tests/conftest.py` — may need new fixtures
- `src/app/api/analyze/route.ts` — slim to auth/billing/proxy/validate
- `src/lib/analyze/schema.ts` — no structural change; verify vertices field works unchanged

**Deleted files:**
- `geometry-service/app/segment.py` (SAM3)
- `geometry-service/app/polygons.py` (contour extraction)
- `geometry-service/tests/test_polygons.py`
- `geometry-service/tests/test_pipeline_diagnostic.py`
- `geometry-service/tests/test_preprocess.py` (replaced by `test_preprocess_new.py`; final rename to `test_preprocess.py` in Task 14)
- `src/lib/anthropic.ts`
- `src/lib/geometry/client.ts` (replaced by `src/lib/analyzer/client.ts`)
- `src/lib/geometry/__tests__/client.test.ts` (replaced by analyzer client test)

---

## Task 1: Swap Python dependencies

**Files:**
- Modify: `geometry-service/pyproject.toml`

- [ ] **Step 1: Update pyproject.toml to drop GPU deps and add LLM deps**

Replace the full contents of `geometry-service/pyproject.toml` with:

```toml
[project]
name = "coolbid-geometry"
version = "0.2.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "python-multipart>=0.0.9",
    "opencv-python-headless>=4.10",
    "numpy>=2.0",
    "pydantic>=2.10",
    "anthropic>=0.39",
    "shapely>=2.0",
    "Pillow>=11.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.25",
    "httpx>=0.28",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
asyncio_mode = "auto"
```

- [ ] **Step 2: Install locally to verify versions resolve**

Run: `cd geometry-service && pip install -e ".[dev]"`
Expected: clean install, no resolution errors.

- [ ] **Step 3: Commit**

```bash
git add geometry-service/pyproject.toml
git commit -m "chore(geometry-service): swap deps for vision-LLM pipeline"
```

---

## Task 2: Add Pydantic response types

**Files:**
- Modify: `geometry-service/app/types.py`

- [ ] **Step 1: Add AnalysisResponse schema matching Next.js Zod shape**

Append to `geometry-service/app/types.py` (keep existing `Point`, `BBox`, `AdjacencyEdge`, `RoomPolygon`, `GeometryResult`; they are retained for backwards reference but no longer emitted):

```python
class Vertex(BaseModel):
    x: float
    y: float


class RoomAnalysis(BaseModel):
    name: str
    type: str
    floor: int = 1
    unit: int | None = None
    estimated_sqft: float
    width_ft: float
    length_ft: float
    window_count: int = 0
    exterior_walls: int = 1
    ceiling_height: float = 9.0
    notes: str = ""
    polygon_id: str
    vertices: list[Vertex]
    bbox: BBox
    centroid: Point
    adjacent_rooms: list[str] = []


class BuildingAnalysis(BaseModel):
    stories: int = 1
    total_sqft: float
    units: int = 1
    has_garage: bool = False
    building_shape: str = "rectangle"
    unit_sqft: list[float] | None = None


class HvacNotes(BaseModel):
    suggested_equipment_location: str = ""
    suggested_zones: int = 1
    special_considerations: list[str] = []


class AnalysisResponse(BaseModel):
    floorplan_type: str = "residential floor plan"
    confidence: Literal["high", "medium", "low"] = "medium"
    building: BuildingAnalysis
    rooms: list[RoomAnalysis]
    hvac_notes: HvacNotes
    analysis_notes: str = ""
```

- [ ] **Step 2: Import Literal and verify the file parses**

Run: `cd geometry-service && python -c "from app.types import AnalysisResponse; print(AnalysisResponse.model_json_schema())"`
Expected: prints JSON schema without error.

- [ ] **Step 3: Commit**

```bash
git add geometry-service/app/types.py
git commit -m "feat(geometry-service): add AnalysisResponse Pydantic types"
```

---

## Task 3: Write vision prompt constants

**Files:**
- Create: `geometry-service/app/prompts.py`

- [ ] **Step 1: Create prompts module**

Create `geometry-service/app/prompts.py`:

```python
"""Prompts for the vision-LLM floor-plan analyzer."""

SYSTEM_PROMPT = """You are an expert HVAC load calculation engineer analyzing architectural floor plans. Your job: identify every room in the plan, trace its polygon boundary, and extract HVAC-relevant attributes (dimensions, windows, exterior walls).

How to read architectural floor plans:
1. WALLS are drawn as THICK solid lines OR pairs of parallel lines with hatching between them. Rooms are bounded by walls.
2. DIMENSION LINES are THIN lines with tick marks, arrows, or dots at each end; the number between them is the measurement (e.g., 12'-6" = 12.5 ft). IGNORE these when tracing polygons.
3. CHAIN DIMENSIONS run along exterior walls in segments. Their individual values must sum to the chain total — use as cross-check.
4. ROOM LABELS are printed inside each room boundary (e.g., "MSTR BDRM", "KITCHEN").
5. WINDOWS appear as parallel lines in a wall with a gap, or as a short arc. Count distinct window symbols per room.
6. EXTERIOR walls are thicker than interior partitions. Count how many sides of each room face an exterior wall."""


ANALYZE_PROMPT = """Analyze the floor plan image and extract EVERY room with its polygon boundary.

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

## Step 3 — Extract attributes from dimension annotations
For each room, read the dimension annotations (feet-inches or decimal feet) to get width_ft and length_ft. Compute estimated_sqft = width_ft × length_ft. Verify the sum of all conditioned room sqft is within 10% of the total building sqft annotation.

## Step 4 — Assign stable polygon IDs
Number rooms in reading order (top-left to bottom-right) as "room_0", "room_1", etc.

## Output format
Return ONE valid JSON object. No markdown, no code fences, no explanation.

```
{
  "floorplan_type": "string",
  "confidence": "high" | "medium" | "low",
  "building": {
    "stories": 1,
    "total_sqft": 1725,
    "units": 1,
    "has_garage": true,
    "building_shape": "L-shape",
    "unit_sqft": [1725]
  },
  "rooms": [
    {
      "name": "exact label from plan",
      "type": "master_bedroom | bedroom | living_room | family_room | kitchen | dining_room | bathroom | half_bath | hallway | laundry | office | foyer | sunroom | bonus_room | basement | closet | garage",
      "floor": 1,
      "unit": 1,
      "estimated_sqft": 240,
      "width_ft": 12,
      "length_ft": 20,
      "window_count": 2,
      "exterior_walls": 2,
      "ceiling_height": 9,
      "notes": "",
      "polygon_id": "room_0",
      "vertices": [
        {"x": 0.12, "y": 0.30},
        {"x": 0.35, "y": 0.30},
        {"x": 0.35, "y": 0.55},
        {"x": 0.12, "y": 0.55}
      ],
      "adjacent_rooms": ["Hallway", "Kitchen"]
    }
  ],
  "hvac_notes": {
    "suggested_equipment_location": "string",
    "suggested_zones": 1,
    "special_considerations": []
  },
  "analysis_notes": "anything notable"
}
```

Set confidence to "low" if the image is blurry, skewed severely, or dimensions are illegible. Set "medium" if you're unsure about some room boundaries. Set "high" only when every polygon is tight against walls and every dimension was read directly."""
```

- [ ] **Step 2: Verify file parses**

Run: `cd geometry-service && python -c "from app.prompts import SYSTEM_PROMPT, ANALYZE_PROMPT; print(len(ANALYZE_PROMPT))"`
Expected: prints a number (length of ANALYZE_PROMPT string).

- [ ] **Step 3: Commit**

```bash
git add geometry-service/app/prompts.py
git commit -m "feat(geometry-service): add vision LLM prompts"
```

---

## Task 4: Rewrite image preprocessing

**Files:**
- Modify: `geometry-service/app/preprocess.py`
- Create: `geometry-service/tests/test_preprocess_new.py`

- [ ] **Step 1: Write failing tests**

Create `geometry-service/tests/test_preprocess_new.py`:

```python
import numpy as np
import pytest

from app.preprocess import prepare_image_for_vision


def test_downsizes_large_image():
    big = np.zeros((4000, 6000, 3), dtype=np.uint8)
    result = prepare_image_for_vision(big, max_long_edge=2048)
    h, w = result.shape[:2]
    assert max(h, w) == 2048
    assert w / h == pytest.approx(6000 / 4000, rel=0.01)


def test_preserves_small_image():
    small = np.zeros((800, 1200, 3), dtype=np.uint8)
    result = prepare_image_for_vision(small, max_long_edge=2048)
    assert result.shape == small.shape


def test_returns_uint8_rgb():
    img = np.random.randint(0, 255, (1000, 1500, 3), dtype=np.uint8)
    result = prepare_image_for_vision(img)
    assert result.dtype == np.uint8
    assert result.shape[2] == 3


def test_clahe_increases_contrast_on_low_contrast_image():
    # A uniform gray image has zero contrast; CLAHE should not crash.
    flat = np.full((1000, 1500, 3), 128, dtype=np.uint8)
    result = prepare_image_for_vision(flat)
    assert result.shape == flat.shape
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd geometry-service && pytest tests/test_preprocess_new.py -v`
Expected: FAIL with `ImportError` or `AttributeError` (function not defined yet).

- [ ] **Step 3: Replace preprocess.py contents**

Replace the entire contents of `geometry-service/app/preprocess.py` with:

```python
"""Image preprocessing for vision-LLM floor plan analysis.

The pipeline is intentionally minimal: downscale to a sensible max edge and
apply CLAHE contrast normalization so handwritten dimensions and room labels
read well in the vision model. No deskew — Claude handles moderate rotation
fine, and dominant-angle detection is unreliable on hand-drawn plans.
"""
from __future__ import annotations

import cv2
import numpy as np


def prepare_image_for_vision(
    img: np.ndarray, *, max_long_edge: int = 2048
) -> np.ndarray:
    """Downscale and contrast-normalize a floor plan image."""
    h, w = img.shape[:2]
    long_edge = max(h, w)
    if long_edge > max_long_edge:
        scale = max_long_edge / long_edge
        new_w = round(w * scale)
        new_h = round(h * scale)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # CLAHE on the luminance channel preserves color while boosting local contrast.
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge((l, a, b))
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd geometry-service && pytest tests/test_preprocess_new.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add geometry-service/app/preprocess.py geometry-service/tests/test_preprocess_new.py
git commit -m "feat(geometry-service): minimal preprocessing for vision LLM"
```

---

## Task 5: Vision LLM call wrapper

**Files:**
- Create: `geometry-service/app/vision.py`

- [ ] **Step 1: Create vision module**

Create `geometry-service/app/vision.py`:

```python
"""Anthropic Claude Sonnet 4 vision call for floor-plan analysis."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any

import cv2
import numpy as np
from anthropic import AsyncAnthropic

from .prompts import ANALYZE_PROMPT, SYSTEM_PROMPT

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 16000
THINKING_BUDGET = 8000


class VisionError(Exception):
    """Raised when the vision LLM call fails or returns unparseable output."""


def _encode_jpeg(img: np.ndarray, quality: int = 90) -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise VisionError("Failed to JPEG-encode preprocessed image")
    return buf.tobytes()


def _extract_json(text: str) -> str:
    """Extract the first top-level JSON object from a string."""
    # Strip common code-fence wrappers Claude occasionally emits despite being told not to.
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = text.find("{")
    if start == -1:
        raise VisionError("No JSON object found in model response")
    depth = 0
    for i in range(start, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise VisionError("Unbalanced JSON braces in model response")


async def analyze_floor_plan(img: np.ndarray) -> dict[str, Any]:
    """Send the preprocessed image to Claude and return the parsed JSON analysis."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise VisionError("ANTHROPIC_API_KEY is not set")

    client = AsyncAnthropic(api_key=api_key)
    image_bytes = _encode_jpeg(img)
    image_b64 = base64.standard_b64encode(image_bytes).decode("ascii")

    response = await client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        thinking={"type": "enabled", "budget_tokens": THINKING_BUDGET},
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": ANALYZE_PROMPT},
                ],
            }
        ],
    )

    text_parts = [block.text for block in response.content if block.type == "text"]
    raw = "\n".join(text_parts).strip()
    if not raw:
        raise VisionError("Model returned no text content")

    json_text = _extract_json(raw)
    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse error: %s\nRaw text: %s", exc, raw[:2000])
        raise VisionError(f"Could not parse JSON from model response: {exc}") from exc

    if not isinstance(parsed, dict):
        raise VisionError("Model JSON was not an object")
    return parsed
```

- [ ] **Step 2: Sanity import check**

Run: `cd geometry-service && python -c "from app.vision import analyze_floor_plan, _extract_json; assert _extract_json('```json\\n{\"a\":1}\\n```') == '{\"a\":1}'"`
Expected: no output (silent success).

- [ ] **Step 3: Commit**

```bash
git add geometry-service/app/vision.py
git commit -m "feat(geometry-service): Anthropic vision call wrapper"
```

---

## Task 6: Polygon postprocessing with shapely

**Files:**
- Create: `geometry-service/app/postprocess.py`
- Create: `geometry-service/tests/test_postprocess.py`

- [ ] **Step 1: Write failing tests**

Create `geometry-service/tests/test_postprocess.py`:

```python
import pytest

from app.postprocess import postprocess_analysis
from app.types import AnalysisResponse


def _base_room(polygon_id: str, vertices: list[dict], name: str = "Room"):
    return {
        "name": name,
        "type": "bedroom",
        "floor": 1,
        "estimated_sqft": 200,
        "width_ft": 10,
        "length_ft": 20,
        "window_count": 1,
        "exterior_walls": 1,
        "ceiling_height": 9,
        "notes": "",
        "polygon_id": polygon_id,
        "vertices": vertices,
        "adjacent_rooms": [],
    }


def _base_payload(rooms: list[dict]) -> dict:
    return {
        "floorplan_type": "residential",
        "confidence": "medium",
        "building": {
            "stories": 1,
            "total_sqft": 1000,
            "units": 1,
            "has_garage": False,
            "building_shape": "rectangle",
        },
        "rooms": rooms,
        "hvac_notes": {
            "suggested_equipment_location": "",
            "suggested_zones": 1,
            "special_considerations": [],
        },
        "analysis_notes": "",
    }


def test_computes_bbox_and_centroid_from_vertices():
    verts = [
        {"x": 0.1, "y": 0.2},
        {"x": 0.3, "y": 0.2},
        {"x": 0.3, "y": 0.5},
        {"x": 0.1, "y": 0.5},
    ]
    payload = _base_payload([_base_room("room_0", verts)])
    result = postprocess_analysis(payload)
    room = result.rooms[0]
    assert room.bbox.x == pytest.approx(0.1)
    assert room.bbox.y == pytest.approx(0.2)
    assert room.bbox.width == pytest.approx(0.2)
    assert room.bbox.height == pytest.approx(0.3)
    assert room.centroid.x == pytest.approx(0.2)
    assert room.centroid.y == pytest.approx(0.35)


def test_clamps_vertices_to_unit_square():
    verts = [
        {"x": -0.1, "y": 0.0},
        {"x": 1.2, "y": 0.0},
        {"x": 1.2, "y": 0.5},
        {"x": -0.1, "y": 0.5},
    ]
    payload = _base_payload([_base_room("room_0", verts)])
    result = postprocess_analysis(payload)
    for v in result.rooms[0].vertices:
        assert 0.0 <= v.x <= 1.0
        assert 0.0 <= v.y <= 1.0


def test_drops_rooms_with_degenerate_polygons():
    # Fewer than 3 vertices = not a polygon.
    bad = _base_room("room_0", [{"x": 0.1, "y": 0.1}, {"x": 0.2, "y": 0.2}])
    good = _base_room("room_1", [
        {"x": 0.3, "y": 0.3}, {"x": 0.5, "y": 0.3},
        {"x": 0.5, "y": 0.5}, {"x": 0.3, "y": 0.5},
    ], name="Keep")
    payload = _base_payload([bad, good])
    result = postprocess_analysis(payload)
    assert [r.name for r in result.rooms] == ["Keep"]


def test_assigns_stable_polygon_ids_when_missing():
    verts = [
        {"x": 0.1, "y": 0.2}, {"x": 0.3, "y": 0.2},
        {"x": 0.3, "y": 0.5}, {"x": 0.1, "y": 0.5},
    ]
    room = _base_room("", verts)
    payload = _base_payload([room])
    result = postprocess_analysis(payload)
    assert result.rooms[0].polygon_id == "room_0"


def test_requires_at_least_one_room():
    payload = _base_payload([])
    with pytest.raises(ValueError, match="at least one room"):
        postprocess_analysis(payload)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd geometry-service && pytest tests/test_postprocess.py -v`
Expected: FAIL with `ImportError` (postprocess_analysis not defined).

- [ ] **Step 3: Implement postprocess module**

Create `geometry-service/app/postprocess.py`:

```python
"""Validate and enrich the LLM's raw floor-plan analysis.

The LLM provides polygon vertices; this module clamps them to the unit
square, derives bbox/centroid via shapely, drops degenerate polygons,
and returns a validated Pydantic AnalysisResponse ready for transport.
"""
from __future__ import annotations

import logging
from typing import Any

from shapely.geometry import Polygon

from .types import (
    AnalysisResponse,
    BBox,
    Point,
    RoomAnalysis,
    Vertex,
)

logger = logging.getLogger(__name__)


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _clean_vertices(raw: list[dict[str, Any]]) -> list[Vertex]:
    return [Vertex(x=_clamp01(float(v["x"])), y=_clamp01(float(v["y"]))) for v in raw]


def _to_shapely(verts: list[Vertex]) -> Polygon | None:
    if len(verts) < 3:
        return None
    poly = Polygon([(v.x, v.y) for v in verts])
    if not poly.is_valid:
        poly = poly.buffer(0)
        if poly.is_empty or poly.geom_type != "Polygon":
            return None
    if poly.area <= 0.0001:  # less than 0.01% of image — drop as noise
        return None
    return poly


def postprocess_analysis(raw: dict[str, Any]) -> AnalysisResponse:
    """Turn the raw LLM JSON into a validated AnalysisResponse."""
    rooms_in = raw.get("rooms") or []
    cleaned: list[dict[str, Any]] = []

    for idx, room in enumerate(rooms_in):
        verts_raw = room.get("vertices") or []
        verts = _clean_vertices(verts_raw)
        poly = _to_shapely(verts)
        if poly is None:
            logger.info(
                "Dropping room %r: degenerate polygon (%d vertices)",
                room.get("name"),
                len(verts),
            )
            continue

        minx, miny, maxx, maxy = poly.bounds
        centroid = poly.centroid

        polygon_id = room.get("polygon_id") or f"room_{idx}"

        cleaned.append(
            {
                **room,
                "polygon_id": polygon_id,
                "vertices": [v.model_dump() for v in verts],
                "bbox": BBox(
                    x=minx, y=miny, width=maxx - minx, height=maxy - miny
                ).model_dump(),
                "centroid": Point(x=centroid.x, y=centroid.y).model_dump(),
            }
        )

    if not cleaned:
        raise ValueError("Analysis must contain at least one room with a valid polygon")

    # Re-number polygon_ids to keep them dense and stable after drops.
    for i, room in enumerate(cleaned):
        room["polygon_id"] = f"room_{i}"

    return AnalysisResponse.model_validate({**raw, "rooms": cleaned})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd geometry-service && pytest tests/test_postprocess.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add geometry-service/app/postprocess.py geometry-service/tests/test_postprocess.py
git commit -m "feat(geometry-service): shapely-based polygon postprocessing"
```

---

## Task 7: Wire the /analyze endpoint

**Files:**
- Modify: `geometry-service/app/main.py`
- Create: `geometry-service/tests/test_api.py` (replacing old file)

- [ ] **Step 1: Replace main.py**

Replace the entire contents of `geometry-service/app/main.py` with:

```python
"""CoolBid floor-plan analyzer service."""
import logging
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile

from .postprocess import postprocess_analysis
from .preprocess import prepare_image_for_vision
from .types import AnalysisResponse
from .vision import VisionError, analyze_floor_plan

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CoolBid Floor Plan Analyzer")


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(image: UploadFile = File(...)) -> AnalysisResponse:
    """Analyze a floor plan image end-to-end: preprocess → vision → postprocess."""
    start = time.monotonic()

    contents = await image.read()
    arr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=422, detail={"error": "Could not decode image"})

    h, w = img.shape[:2]
    logger.info("Received image: %dx%d", w, h)

    t0 = time.monotonic()
    prepared = prepare_image_for_vision(img)
    logger.info("Preprocess: %.2fs", time.monotonic() - t0)

    t1 = time.monotonic()
    try:
        raw = await analyze_floor_plan(prepared)
    except VisionError as exc:
        logger.error("Vision call failed: %s", exc)
        raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc
    logger.info("Vision: %.2fs", time.monotonic() - t1)

    t2 = time.monotonic()
    try:
        response = postprocess_analysis(raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)}) from exc
    logger.info("Postprocess: %.2fs", time.monotonic() - t2)

    logger.info(
        "Total: %.2fs (%d rooms)",
        time.monotonic() - start,
        len(response.rooms),
    )
    return response


@app.get("/health")
async def health():
    import os
    return {
        "status": "ok",
        "anthropic_key_set": bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()),
    }
```

- [ ] **Step 2: Rewrite tests/test_api.py**

Replace the contents of `geometry-service/tests/test_api.py` with:

```python
from unittest.mock import AsyncMock, patch

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _jpeg_bytes(w: int = 1000, h: int = 800) -> bytes:
    img = np.full((h, w, 3), 200, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "anthropic_key_set" in body


def test_analyze_rejects_invalid_image():
    response = client.post(
        "/analyze", files={"image": ("bad.jpg", b"not an image", "image/jpeg")}
    )
    assert response.status_code == 422


@patch("app.main.analyze_floor_plan", new_callable=AsyncMock)
def test_analyze_happy_path(mock_vision):
    mock_vision.return_value = {
        "floorplan_type": "residential",
        "confidence": "high",
        "building": {
            "stories": 1,
            "total_sqft": 1000,
            "units": 1,
            "has_garage": False,
            "building_shape": "rectangle",
        },
        "rooms": [
            {
                "name": "Living Room",
                "type": "living_room",
                "floor": 1,
                "estimated_sqft": 300,
                "width_ft": 15,
                "length_ft": 20,
                "window_count": 2,
                "exterior_walls": 2,
                "ceiling_height": 9,
                "notes": "",
                "polygon_id": "room_0",
                "vertices": [
                    {"x": 0.1, "y": 0.1}, {"x": 0.5, "y": 0.1},
                    {"x": 0.5, "y": 0.4}, {"x": 0.1, "y": 0.4},
                ],
                "adjacent_rooms": [],
            }
        ],
        "hvac_notes": {
            "suggested_equipment_location": "attic",
            "suggested_zones": 1,
            "special_considerations": [],
        },
        "analysis_notes": "",
    }

    response = client.post(
        "/analyze",
        files={"image": ("plan.jpg", _jpeg_bytes(), "image/jpeg")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["rooms"]) == 1
    assert body["rooms"][0]["polygon_id"] == "room_0"
    assert body["rooms"][0]["bbox"]["width"] == pytest.approx(0.4)


@patch("app.main.analyze_floor_plan", new_callable=AsyncMock)
def test_analyze_returns_422_on_no_valid_rooms(mock_vision):
    mock_vision.return_value = {
        "floorplan_type": "residential",
        "confidence": "low",
        "building": {
            "stories": 1, "total_sqft": 0, "units": 1,
            "has_garage": False, "building_shape": "unknown",
        },
        "rooms": [],  # no rooms
        "hvac_notes": {
            "suggested_equipment_location": "",
            "suggested_zones": 1,
            "special_considerations": [],
        },
        "analysis_notes": "",
    }

    response = client.post(
        "/analyze",
        files={"image": ("plan.jpg", _jpeg_bytes(), "image/jpeg")},
    )
    assert response.status_code == 422
```

- [ ] **Step 3: Run tests**

Run: `cd geometry-service && pytest tests/test_api.py -v`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add geometry-service/app/main.py geometry-service/tests/test_api.py
git commit -m "feat(geometry-service): /analyze endpoint wires preprocess + vision + postprocess"
```

---

## Task 8: Update Modal deployment config

**Files:**
- Modify: `geometry-service/modal_app.py`

**Rollback safety:** The Modal app name changes from `coolbid-geometry` → `coolbid-analyzer`. This creates a NEW Modal deployment at a NEW URL, leaving the existing SAM3 service (`coolbid-geometry`) untouched and still running at its current URL. Rolling back = point `ANALYZER_SERVICE_URL` back at the old SAM3 URL and revert the Next.js code. Do NOT delete the old `coolbid-geometry` Modal app until the new pipeline is proven in production.

- [ ] **Step 1: Replace modal_app.py**

Replace the contents of `geometry-service/modal_app.py` with:

```python
"""Modal deployment for the CoolBid Floor Plan Analyzer.

Deploy with: modal deploy modal_app.py
Run locally with: modal serve modal_app.py
"""
import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi>=0.115",
        "uvicorn[standard]>=0.34",
        "python-multipart>=0.0.9",
        "opencv-python-headless>=4.10",
        "numpy>=2.0",
        "pydantic>=2.10",
        "anthropic>=0.39",
        "shapely>=2.0",
        "Pillow>=11.0",
    )
    .add_local_dir("app", remote_path="/root/app")
)

app = modal.App("coolbid-analyzer", image=image)


@app.function(
    timeout=300,
    secrets=[modal.Secret.from_name("anthropic")],
)
@modal.asgi_app()
def fastapi_app():
    from app.main import app
    return app
```

- [ ] **Step 2: Create Modal secret (manual step — user runs this)**

Run: `modal secret create anthropic ANTHROPIC_API_KEY=<your-key>`
Expected: secret created. Skip if already exists.

- [ ] **Step 3: Serve locally to verify**

Run: `cd geometry-service && modal serve modal_app.py`
In a second terminal: `curl http://<the-url-modal-prints>/health`
Expected: `{"status":"ok","anthropic_key_set":true}`

Stop the `modal serve` process after verifying.

- [ ] **Step 4: Commit**

```bash
git add geometry-service/modal_app.py
git commit -m "chore(modal): CPU-only image, anthropic secret, no GPU"
```

---

## Task 9: Delete obsolete geometry-service files

**Files:**
- Delete: `geometry-service/app/segment.py`
- Delete: `geometry-service/app/polygons.py`
- Delete: `geometry-service/tests/test_polygons.py`
- Delete: `geometry-service/tests/test_pipeline_diagnostic.py`
- Delete: `geometry-service/tests/test_preprocess.py` (the old one)
- Rename: `geometry-service/tests/test_preprocess_new.py` → `geometry-service/tests/test_preprocess.py`

- [ ] **Step 1: Verify no imports remain**

Run: `cd geometry-service && grep -rn "from app.segment\|from app.polygons\|import segment\|import polygons" app/ tests/`
Expected: no output (no remaining references).

- [ ] **Step 2: Delete files**

```bash
rm geometry-service/app/segment.py
rm geometry-service/app/polygons.py
rm geometry-service/tests/test_polygons.py
rm geometry-service/tests/test_pipeline_diagnostic.py
rm geometry-service/tests/test_preprocess.py
mv geometry-service/tests/test_preprocess_new.py geometry-service/tests/test_preprocess.py
```

- [ ] **Step 3: Run full test suite**

Run: `cd geometry-service && pytest -v`
Expected: all tests pass (postprocess + preprocess + api).

- [ ] **Step 4: Commit**

```bash
git add -A geometry-service/
git commit -m "chore(geometry-service): delete CV/SAM3 modules and obsolete tests"
```

---

## Task 10: Create new Next.js analyzer client

**Files:**
- Create: `src/lib/analyzer/client.ts`
- Create: `src/lib/analyzer/__tests__/client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/analyzer/__tests__/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeFloorPlan, AnalyzerServiceError } from "../client";

describe("analyzeFloorPlan", () => {
  const originalEnv = process.env.ANALYZER_SERVICE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ANALYZER_SERVICE_URL = "http://localhost:8000";
  });

  afterEach(() => {
    process.env.ANALYZER_SERVICE_URL = originalEnv;
    global.fetch = originalFetch;
  });

  it("posts image as multipart and returns parsed JSON", async () => {
    const mockResponse = {
      floorplan_type: "residential",
      confidence: "high",
      building: { stories: 1, total_sqft: 1000, units: 1, has_garage: false, building_shape: "rect" },
      rooms: [],
      hvac_notes: { suggested_equipment_location: "", suggested_zones: 1, special_considerations: [] },
      analysis_notes: "",
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;

    const result = await analyzeFloorPlan(Buffer.from("fake"), "image/jpeg");
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/analyze",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws when ANALYZER_SERVICE_URL is not set", async () => {
    delete process.env.ANALYZER_SERVICE_URL;
    await expect(analyzeFloorPlan(Buffer.from("img"), "image/jpeg")).rejects.toThrow(
      "ANALYZER_SERVICE_URL"
    );
  });

  it("raises AnalyzerServiceError on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ detail: { error: "Vision call failed" } }),
    }) as unknown as typeof fetch;

    await expect(analyzeFloorPlan(Buffer.from("img"), "image/jpeg")).rejects.toMatchObject({
      name: "AnalyzerServiceError",
      statusCode: 502,
    });
  });

  it("raises AnalyzerServiceError on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("econnrefused"));
    await expect(analyzeFloorPlan(Buffer.from("img"), "image/jpeg")).rejects.toThrow(
      "Analyzer service unavailable"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/lib/analyzer/__tests__/client.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement client**

Create `src/lib/analyzer/client.ts`:

```typescript
/** Raw shape of the Modal /analyze response — validated downstream by Zod. */
export type AnalyzerResponse = unknown;

export class AnalyzerServiceError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "AnalyzerServiceError";
  }
}

export async function analyzeFloorPlan(
  imageBuffer: Buffer,
  mediaType: string,
): Promise<AnalyzerResponse> {
  const baseUrl = process.env.ANALYZER_SERVICE_URL?.trim();
  if (!baseUrl) {
    throw new AnalyzerServiceError("ANALYZER_SERVICE_URL environment variable is not set");
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mediaType });
  formData.append("image", blob, `floorplan.${mediaType.split("/")[1] || "jpg"}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    throw new AnalyzerServiceError(
      `Analyzer service unavailable: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  if (!response.ok) {
    let detail = "Analysis failed";
    try {
      const body = await response.json();
      detail = body?.detail?.error ?? body?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new AnalyzerServiceError(detail, response.status);
  }

  return (await response.json()) as AnalyzerResponse;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/analyzer/__tests__/client.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyzer/
git commit -m "feat(analyzer): Next.js client for Modal /analyze endpoint"
```

---

## Task 11: Slim down /api/analyze route

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Replace route.ts contents**

Replace the entire contents of `src/app/api/analyze/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  checkAiActionLimit,
  incrementAiActionCount,
} from "@/lib/billing/ai-action-counter";
import { AnalysisResultSchema } from "@/lib/analyze/schema";
import { validateAnalysis } from "@/lib/analyze/validate-analysis";
import { analyzeFloorPlan, AnalyzerServiceError } from "@/lib/analyzer/client";

export const maxDuration = 180;

const ImageSchema = z.object({
  base64: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  pageNum: z.number().int().positive().optional(),
});

const RequestSchema = z.object({
  images: z.array(ImageSchema).min(1),
  buildingInfo: z
    .object({
      totalSqft: z.number().positive().optional(),
      units: z.number().int().positive().optional(),
      hvacPerUnit: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitCheck = await checkAiActionLimit(supabase, user.id);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error:
          limitCheck.reason === "trial_limit"
            ? "Trial limit reached. Subscribe to continue."
            : "Subscription required.",
        code: limitCheck.reason,
      },
      { status: 402 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { images, buildingInfo } = parsed.data;

  // Analyze each page in parallel, then merge rooms (tagging each room with its floor).
  let perFloor: Array<{ floor: number; raw: unknown }>;
  try {
    perFloor = await Promise.all(
      images.map(async (img, idx) => {
        const buffer = Buffer.from(img.base64, "base64");
        const raw = await analyzeFloorPlan(buffer, img.mediaType);
        return { floor: img.pageNum ?? idx + 1, raw };
      })
    );
  } catch (err) {
    console.error("analyzer service error:", err);
    if (err instanceof AnalyzerServiceError) {
      return NextResponse.json(
        { error: err.message, code: "analyzer_failed" },
        { status: err.statusCode ?? 502 }
      );
    }
    return NextResponse.json(
      { error: "Analysis failed", details: "Analyzer service error" },
      { status: 500 }
    );
  }

  // Merge per-floor analyses into a single AnalysisResult shape.
  const merged = mergeFloors(perFloor);

  // Validate with Zod schema (coerces types, normalizes room types, applies defaults).
  const validated = AnalysisResultSchema.safeParse(merged);
  if (!validated.success) {
    console.error("Schema validation failed:", validated.error.flatten());
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: "Response did not match expected structure",
        validation: validated.error.flatten(),
      },
      { status: 500 }
    );
  }

  const perUnitAnalysis =
    (buildingInfo?.hvacPerUnit ?? false) && (buildingInfo?.units ?? 1) > 1;
  const result = validateAnalysis(validated.data, { perUnitAnalysis });

  if (limitCheck.shouldIncrement) {
    await incrementAiActionCount(supabase, user.id);
  }

  return NextResponse.json(result);
}

/** Combine per-page analyses into one AnalysisResult, stamping each room with its floor. */
function mergeFloors(perFloor: Array<{ floor: number; raw: unknown }>): unknown {
  if (perFloor.length === 1) {
    const { floor, raw } = perFloor[0];
    if (raw && typeof raw === "object" && "rooms" in raw) {
      const r = raw as { rooms?: Array<Record<string, unknown>> };
      r.rooms = (r.rooms ?? []).map((room) => ({ ...room, floor }));
    }
    return raw;
  }

  const first = perFloor[0].raw as Record<string, unknown>;
  const allRooms: Array<Record<string, unknown>> = [];
  let totalSqft = 0;
  let stories = 0;

  for (const { floor, raw } of perFloor) {
    const r = raw as Record<string, unknown>;
    const rooms = (r.rooms as Array<Record<string, unknown>>) ?? [];
    for (const room of rooms) {
      allRooms.push({
        ...room,
        floor,
        polygon_id: `floor${floor}_${room.polygon_id ?? `room_${allRooms.length}`}`,
      });
    }
    const building = r.building as Record<string, unknown> | undefined;
    const sqft = typeof building?.total_sqft === "number" ? building.total_sqft : 0;
    totalSqft += sqft;
    stories = Math.max(stories, floor);
  }

  return {
    ...first,
    building: {
      ...(first.building as Record<string, unknown>),
      stories: Math.max(stories, 1),
      total_sqft: totalSqft || (first.building as { total_sqft?: number })?.total_sqft || 0,
    },
    rooms: allRooms,
  };
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "refactor(analyze): slim route to auth/billing/proxy — Modal owns the analysis"
```

---

## Task 12: Delete obsolete Next.js code

**Files:**
- Delete: `src/lib/anthropic.ts`
- Delete: `src/lib/geometry/client.ts`
- Delete: `src/lib/geometry/__tests__/client.test.ts`
- Delete: `src/lib/geometry/` directory (if empty)
- Possibly modify: `src/lib/analyze/utils.ts` — if `extractTextFromResponse` / `extractJson` are no longer referenced, delete them too

- [ ] **Step 1: Verify no remaining imports**

Run: `grep -rn "from \"@/lib/anthropic\"\|from \"@/lib/geometry" src/`
Expected: no output (no remaining references). If any remain, fix them before deletion.

- [ ] **Step 2: Check if extractJson/extractTextFromResponse are still used**

Run: `grep -rn "extractJson\|extractTextFromResponse" src/`
Expected: only references within `src/lib/analyze/utils.ts` itself. If so, delete `utils.ts` too (or delete those specific exports, keeping anything still used).

- [ ] **Step 3: Delete files**

```bash
rm src/lib/anthropic.ts
rm -rf src/lib/geometry
# Conditionally: rm src/lib/analyze/utils.ts (only if Step 2 confirmed no external users)
```

- [ ] **Step 4: Run full Next.js test + type-check**

Run: `npx tsc --noEmit && npm test`
Expected: clean type-check, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "chore: delete obsolete anthropic.ts and geometry client"
```

---

## Task 13: Update env-var references

**Files:**
- Search: all `.env*` files, documentation, and CI configs

- [ ] **Step 1: Find all references to GEOMETRY_SERVICE_URL**

Run: `grep -rn "GEOMETRY_SERVICE_URL" . --include="*.md" --include=".env*" --include="*.ts" --include="*.tsx" --include="*.yml" --include="*.yaml"`

- [ ] **Step 2: Rename to ANALYZER_SERVICE_URL in each file**

For each file found (except `docs/superpowers/plans/` historical plans, which should be left alone as a record):
- `.env.local`, `.env.example`, `.env.development` — rename the var
- `README.md`, `docs/*.md` (current, not plans) — rename references
- Vercel / CI config — rename references

- [ ] **Step 3: Update Vercel env (manual step, user runs)**

Run: `vercel env rm GEOMETRY_SERVICE_URL` for each environment it's set in, then `vercel env add ANALYZER_SERVICE_URL` with the Modal URL as the value.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: rename GEOMETRY_SERVICE_URL to ANALYZER_SERVICE_URL"
```

---

## Task 14: Deploy Modal and end-to-end test

**Files:** none (operational)

- [ ] **Step 1: Deploy Modal service**

Run: `cd geometry-service && modal deploy modal_app.py`
Expected: deployment succeeds, prints the production URL. Note the URL.

- [ ] **Step 2: Confirm health**

Run: `curl https://<modal-url>/health`
Expected: `{"status":"ok","anthropic_key_set":true}`

- [ ] **Step 3: Start local Next.js dev server with Modal URL**

Ensure `.env.local` has `ANALYZER_SERVICE_URL=https://<modal-url>`. Run: `npm run dev`

- [ ] **Step 4: Upload the test floor plan from the Wright residence photo**

In the browser at `http://localhost:3000` (or your local URL):
1. Log in, start a new estimate
2. Upload `SCR-20260415-tegb.jpeg` (the hand-drawn Wright residence floor plan)
3. Wait for "Room Analysis" screen

- [ ] **Step 5: Verify polygon accuracy visually**

Expected observations, compared to the old CV pipeline:
- Polygons follow actual wall lines (not dimension lines)
- Rooms like Master, Master Bath, Kitchen, Living Room, Garage, Covered Patio are all distinct, non-overlapping polygons
- Room labels appear inside the correct polygon
- No giant triangle spanning half the drawing
- Confidence reported as "medium" or "high"

If polygons are still off, prompt-tune in `geometry-service/app/prompts.py` and redeploy. Common tweaks:
- Emphasize "INNER edge of wall pair" more strongly
- Add a worked example in the prompt of tracing a simple room
- Drop `thinking.budget_tokens` to 4000 if the model is over-thinking

- [ ] **Step 6: Commit any prompt refinements**

```bash
git add geometry-service/app/prompts.py
git commit -m "tune(prompts): refine polygon-tracing instructions based on E2E test"
```

---

## Task 15: Remove legacy unused types

**Files:**
- Modify: `geometry-service/app/types.py`

- [ ] **Step 1: Drop legacy `RoomPolygon` and `GeometryResult` if unreferenced**

Run: `cd geometry-service && grep -rn "RoomPolygon\|GeometryResult" app/ tests/`
Expected output should only be the class definitions themselves — no users elsewhere.

If unreferenced, remove the `RoomPolygon`, `GeometryResult`, and `AdjacencyEdge` classes from `types.py`. Keep `Point`, `BBox`, `Vertex`, `RoomAnalysis`, `BuildingAnalysis`, `HvacNotes`, `AnalysisResponse`.

- [ ] **Step 2: Verify tests still pass**

Run: `cd geometry-service && pytest -v`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add geometry-service/app/types.py
git commit -m "chore(geometry-service): drop unused legacy Pydantic types"
```

---

## Self-Review Notes

Reviewed against scope:
- ✅ Vision LLM outputs polygon vertices directly (Task 3 prompt + Task 5 call)
- ✅ Modal preprocesses (Task 4) + calls Anthropic (Task 5) + postprocesses (Task 6)
- ✅ Next.js route becomes thin (Task 11)
- ✅ UI unchanged — Room.vertices already consumed by FloorplanCanvas
- ✅ Zod schema in `src/lib/analyze/schema.ts` is unchanged — already supports vertices/bbox/centroid and does type normalization via TYPE_ALIASES
- ✅ ANTHROPIC_API_KEY moves to a Modal secret (Task 8); `src/lib/anthropic.ts` is deleted (Task 12)
- ✅ Obsolete CV/SAM3 code deleted (Tasks 9, 12)
- ✅ Env var renamed throughout (Task 13)
- ✅ E2E verification on the actual Wright-residence image (Task 14)

Placeholder scan: no TBDs, every code block is complete, every step has its actual command.

Type consistency: Pydantic `AnalysisResponse` (Python) maps 1:1 to the TS `AnalysisResult` type — `RoomAnalysis` fields match `Room` fields; `vertices`/`bbox`/`centroid` types align. Client method is `analyzeFloorPlan` used consistently. `AnalyzerServiceError` used consistently.
