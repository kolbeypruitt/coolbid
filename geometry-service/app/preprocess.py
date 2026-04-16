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
