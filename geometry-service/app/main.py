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
    """Extract room polygons from a floor plan image."""
    start = time.monotonic()

    contents = await image.read()
    arr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=422, detail={"error": "Could not decode image"})

    h, w = img.shape[:2]
    logger.info("Processing image: %dx%d", w, h)

    # Stage 1: Pre-processing (wall detection + gap closing)
    t0 = time.monotonic()
    wall_mask = detect_walls(img)
    closed = close_gaps(wall_mask, gap_size=15)
    logger.info("Pre-processing: %.2fs", time.monotonic() - t0)

    # Stage 2: Contour-based extraction (baseline)
    t1 = time.monotonic()
    contour_polygons = extract_room_polygons(closed, image_width=w, image_height=h)
    logger.info("Contour-based: %d polygons in %.2fs", len(contour_polygons), time.monotonic() - t1)

    # Stage 3: SAM 3 — only use if it finds more rooms than contours
    best_polygons = contour_polygons
    best_source = "contour"

    if is_sam3_available():
        try:
            t2 = time.monotonic()
            logger.info("Trying SAM 3 (text-prompted)")
            room_masks = segment_rooms_sam3(img)
            if room_masks:
                sam_mask = _masks_to_wall_mask(room_masks, closed.shape)
                sam_polygons = extract_room_polygons(sam_mask, image_width=w, image_height=h)
                logger.info("SAM 3: %d polygons in %.2fs", len(sam_polygons), time.monotonic() - t2)
                if len(sam_polygons) >= len(contour_polygons):
                    best_polygons = sam_polygons
                    best_source = "sam3"
        except Exception as e:
            logger.warning("SAM 3 failed: %s", e)

    logger.info("Using %s segmentation (%d polygons)", best_source, len(best_polygons))

    if not best_polygons:
        raise HTTPException(
            status_code=422,
            detail={"error": "Could not detect room boundaries in floor plan"},
        )

    # Stage 4: Adjacency
    t3 = time.monotonic()
    best_polygons = compute_adjacency(best_polygons)
    adj_count = sum(len(p.adjacent_to) for p in best_polygons)
    logger.info("Adjacency: %d edges in %.2fs", adj_count, time.monotonic() - t3)

    total = time.monotonic() - start
    logger.info("Total processing: %.2fs", total)

    return GeometryResult(polygons=best_polygons, image_width=w, image_height=h)


def _masks_to_wall_mask(room_masks: list[np.ndarray], shape: tuple) -> np.ndarray:
    """Convert room masks into a wall mask (invert of room regions)."""
    combined = np.zeros(shape, dtype=np.uint8)
    for mask in room_masks:
        combined = cv2.bitwise_or(combined, cv2.bitwise_not(mask))
    return combined


@app.get("/health")
async def health():
    return {"status": "ok", "sam3_available": is_sam3_available()}
