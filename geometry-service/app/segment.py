import logging
import numpy as np

logger = logging.getLogger(__name__)

# SAM 3 is optional — fall back to contour-based extraction if not available.
# This lets the service run on CPU for development/testing.
try:
    from sam3 import build_sam3_image_model, Sam3Processor
    SAM3_AVAILABLE = True
except ImportError:
    SAM3_AVAILABLE = False
    logger.info("SAM 3 not installed — using contour-based extraction only")


_processor = None  # Lazy-loaded Sam3Processor


def _get_processor(
    checkpoint: str = "/models/sam3_hiera_large.pt",
):
    """Lazily initialize SAM 3 processor (loads model on first call)."""
    global _processor
    if _processor is not None:
        return _processor

    if not SAM3_AVAILABLE:
        raise RuntimeError("SAM 3 is not installed. Install with: pip install segment-anything-3")

    model = build_sam3_image_model(checkpoint=checkpoint, device="cuda")
    _processor = Sam3Processor(model)
    return _processor


def segment_rooms_sam3(image: np.ndarray) -> list[np.ndarray]:
    """Use SAM 3's text-prompted segmentation to find room regions.

    SAM 3's Promptable Concept Segmentation lets us ask for "enclosed room"
    regions specifically, rather than generic automatic segmentation.

    Args:
        image: BGR floor plan image.

    Returns:
        List of binary masks, one per detected room region.
    """
    processor = _get_processor()
    rgb = image[:, :, ::-1]  # BGR to RGB

    # NOTE: Verify this API against the actual sam3 library docs when deploying
    processor.set_image(rgb)
    masks, scores, _ = processor.predict(
        text_prompt="enclosed room on architectural floor plan",
        multimask_output=True,
    )

    image_area = image.shape[0] * image.shape[1]
    room_masks: list[np.ndarray] = []

    for i, mask in enumerate(masks):
        area = np.count_nonzero(mask)
        area_ratio = area / image_area

        if area_ratio > 0.8 or area_ratio < 0.005:
            continue

        if scores[i] < 0.7:
            continue

        binary = (mask.astype(np.uint8)) * 255
        room_masks.append(binary)

    return room_masks


def is_sam3_available() -> bool:
    """Check whether SAM 3 is installed and usable."""
    return SAM3_AVAILABLE
