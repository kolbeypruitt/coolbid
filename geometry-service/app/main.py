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
