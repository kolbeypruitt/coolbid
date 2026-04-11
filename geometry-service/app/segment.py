import logging
import numpy as np

logger = logging.getLogger(__name__)

# ── SAM 3 (text-prompted, best quality) ─────────────────────────────
try:
    from sam3.model_builder import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor

    SAM3_AVAILABLE = True
except ImportError:
    SAM3_AVAILABLE = False
    logger.info("SAM 3 not installed")

# ── SAM 2 (automatic masks, fallback) ──────────────────────────────
try:
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    SAM2_AVAILABLE = True
except ImportError:
    SAM2_AVAILABLE = False
    logger.info("SAM 2 not installed")


# ── SAM 3 ───────────────────────────────────────────────────────────

_sam3_processor: "Sam3Processor | None" = None


def _get_sam3_processor() -> "Sam3Processor":
    global _sam3_processor
    if _sam3_processor is not None:
        return _sam3_processor

    import torch

    # Load model and force all parameters + buffers to float32.
    # SAM 3 weights are stored as bfloat16 but the A10G has limited
    # bfloat16 support, causing dtype mismatch errors.
    model = build_sam3_image_model()
    model = model.to(dtype=torch.float32)

    _sam3_processor = Sam3Processor(model)
    return _sam3_processor


def segment_rooms_sam3(image: np.ndarray) -> list[np.ndarray]:
    """Use SAM 3's text-prompted segmentation to find room regions."""
    import torch
    processor = _get_sam3_processor()
    rgb = np.ascontiguousarray(image[:, :, ::-1])

    with torch.no_grad(), torch.amp.autocast("cuda", enabled=False):
        inference_state = processor.set_image(rgb)
        output = processor.set_text_prompt(
            state=inference_state,
            prompt="enclosed room on architectural floor plan",
        )

    masks = output["masks"]
    scores = output["scores"]

    return _filter_room_masks(masks, scores, image.shape[0] * image.shape[1])


# ── SAM 2 ───────────────────────────────────────────────────────────

_sam2_predictor: "SAM2ImagePredictor | None" = None


def _get_sam2_predictor() -> "SAM2ImagePredictor":
    global _sam2_predictor
    if _sam2_predictor is not None:
        return _sam2_predictor

    _sam2_predictor = SAM2ImagePredictor.from_pretrained("facebook/sam2.1-hiera-large")
    return _sam2_predictor


def segment_rooms_sam2(image: np.ndarray) -> list[np.ndarray]:
    """Use SAM 2's automatic mask generation to find room regions."""
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

    predictor = _get_sam2_predictor()
    generator = SAM2AutomaticMaskGenerator(
        model=predictor.model,
        points_per_side=32,
        pred_iou_thresh=0.7,
        stability_score_thresh=0.85,
        min_mask_region_area=500,
    )

    rgb = np.ascontiguousarray(image[:, :, ::-1])
    mask_data = generator.generate(rgb)

    # Sort by area descending
    mask_data.sort(key=lambda m: m["area"], reverse=True)

    image_area = image.shape[0] * image.shape[1]
    room_masks: list[np.ndarray] = []

    for m in mask_data:
        area_ratio = m["area"] / image_area
        if area_ratio > 0.8 or area_ratio < 0.005:
            continue
        if m["predicted_iou"] < 0.7:
            continue
        binary = (m["segmentation"].astype(np.uint8)) * 255
        room_masks.append(binary)

    return room_masks


# ── Shared filtering ────────────────────────────────────────────────

def _filter_room_masks(
    masks: list,
    scores: list,
    image_area: int,
) -> list[np.ndarray]:
    """Filter masks by area ratio and confidence score."""
    room_masks: list[np.ndarray] = []

    for i, mask in enumerate(masks):
        mask_np = mask.cpu().numpy() if hasattr(mask, "cpu") else np.array(mask)
        area = np.count_nonzero(mask_np)
        area_ratio = area / image_area

        if area_ratio > 0.8 or area_ratio < 0.005:
            continue

        score = scores[i].item() if hasattr(scores[i], "item") else float(scores[i])
        if score < 0.7:
            continue

        binary = (mask_np.astype(np.uint8)) * 255
        room_masks.append(binary)

    return room_masks


# ── Public API ──────────────────────────────────────────────────────

def is_sam3_available() -> bool:
    return SAM3_AVAILABLE


def is_sam2_available() -> bool:
    return SAM2_AVAILABLE
