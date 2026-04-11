import logging
import numpy as np

logger = logging.getLogger(__name__)

try:
    from sam3.model_builder import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor

    SAM3_AVAILABLE = True
except ImportError:
    SAM3_AVAILABLE = False
    logger.info("SAM 3 not installed — using contour-based extraction only")


_processor: "Sam3Processor | None" = None


def _get_processor() -> "Sam3Processor":
    global _processor
    if _processor is not None:
        return _processor

    import torch

    # Force float32 — SAM 3 weights are bfloat16 but A10G has limited support
    model = build_sam3_image_model()
    model = model.to(dtype=torch.float32)
    _processor = Sam3Processor(model)
    return _processor


def segment_rooms_sam3(image: np.ndarray) -> list[np.ndarray]:
    """Use SAM 3's text-prompted segmentation to find room regions."""
    import torch
    processor = _get_processor()
    rgb = np.ascontiguousarray(image[:, :, ::-1])

    with torch.no_grad(), torch.amp.autocast("cuda", enabled=False):
        inference_state = processor.set_image(rgb)
        output = processor.set_text_prompt(
            state=inference_state,
            prompt="enclosed room on architectural floor plan",
        )

    masks = output["masks"]
    scores = output["scores"]

    image_area = image.shape[0] * image.shape[1]
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


def is_sam3_available() -> bool:
    return SAM3_AVAILABLE
