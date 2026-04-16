"""Image preprocessing for vision-LLM floor plan analysis.

Pipeline: crop-to-paper (removes desk/mouse/margin dead space so Claude's
normalized coords anchor to the actual drawing) → downscale → CLAHE contrast.
The crop is a best-effort largest-bright-quad detector; if it can't find a
confident paper rectangle it falls back to the original image so a bad crop
never makes things worse.
"""
from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def prepare_image_for_vision(
    img: np.ndarray, *, max_long_edge: int = 2048
) -> np.ndarray:
    """Crop to paper, downscale, and contrast-normalize a floor plan image."""
    img = _crop_to_paper(img)

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


def _crop_to_paper(img: np.ndarray) -> np.ndarray:
    """Best-effort: detect the paper rectangle in the photo and crop+warp to it.

    Returns the original image unchanged if no confident quadrilateral is found.
    """
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Blur + Otsu threshold separates bright paper from darker desk/background.
    blurred = cv2.GaussianBlur(gray, (9, 9), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Morphological close to seal small gaps (mouse shadow edges, fold lines).
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        logger.info("crop: no contours found, keeping original")
        return img

    image_area = h * w
    largest = max(contours, key=cv2.contourArea)
    paper_area = cv2.contourArea(largest)
    if paper_area < 0.35 * image_area:
        # Paper should fill at least ~35% of the frame in any reasonable scan.
        logger.info("crop: largest contour too small, keeping original")
        return img
    if paper_area > 0.97 * image_area:
        # Already fills the frame — a warp would only shave pixels and distort.
        logger.info("crop: paper already fills frame, keeping original")
        return img

    # Approximate to a polygon and require ~quadrilateral.
    peri = cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, 0.02 * peri, True)
    if len(approx) != 4:
        logger.info("crop: largest contour has %d corners, keeping original", len(approx))
        return img

    quad = _order_quad(approx.reshape(4, 2).astype(np.float32))
    (tl, tr, br, bl) = quad
    target_w = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
    target_h = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
    if target_w < 400 or target_h < 400:
        logger.info("crop: target size %dx%d too small, keeping original", target_w, target_h)
        return img

    dst = np.array(
        [[0, 0], [target_w - 1, 0], [target_w - 1, target_h - 1], [0, target_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(quad, dst)
    warped = cv2.warpPerspective(img, matrix, (target_w, target_h))
    logger.info("crop: warped %dx%d -> %dx%d", w, h, target_w, target_h)
    return warped


def _order_quad(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as top-left, top-right, bottom-right, bottom-left."""
    # Top-left has smallest sum, bottom-right has largest sum.
    # Top-right has smallest diff (x - y), bottom-left has largest diff.
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array(
        [
            pts[np.argmin(s)],
            pts[np.argmin(d)],
            pts[np.argmax(s)],
            pts[np.argmax(d)],
        ],
        dtype=np.float32,
    )
