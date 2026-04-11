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
