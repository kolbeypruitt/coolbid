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

    t0 = time.monotonic()
    wall_mask = detect_walls(img)
    closed = close_gaps(wall_mask, gap_size=15)
    logger.info("Pre-processing: %.2fs", time.monotonic() - t0)

    t1 = time.monotonic()
    if is_sam3_available():
        logger.info("Using SAM 3 segmentation")
        room_masks = segment_rooms_sam3(img)
        if room_masks:
            combined = np.zeros_like(closed)
            for mask in room_masks:
                combined = cv2.bitwise_or(combined, cv2.bitwise_not(mask))
            closed = combined
    logger.info("Segmentation: %.2fs", time.monotonic() - t1)

    t2 = time.monotonic()
    polygons = extract_room_polygons(closed, image_width=w, image_height=h)
    logger.info("Polygon extraction: %d polygons in %.2fs", len(polygons), time.monotonic() - t2)

    if not polygons:
        raise HTTPException(
            status_code=422,
            detail={"error": "Could not detect room boundaries in floor plan"},
        )

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
