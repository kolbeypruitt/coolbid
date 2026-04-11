import cv2
import numpy as np


def normalize_scan(image: np.ndarray) -> np.ndarray:
    """Normalize a floor plan image so lines are dark and background is white.

    Handles photographed blueprints (dark paper, blue tint, shadows),
    scanned documents (off-white paper), and clean CAD exports alike.

    Steps:
        1. Convert to grayscale using the channel with best line contrast
        2. CLAHE for local contrast enhancement (handles uneven lighting)
        3. Percentile stretch — map paper to white, lines to black
    """
    # Use the channel with the widest intensity range (best line/paper contrast).
    # For blue blueprints, the red channel often has best separation since
    # blue paper absorbs red light while dark ink absorbs all channels.
    channels = cv2.split(image)
    ranges = [float(np.percentile(ch, 98) - np.percentile(ch, 2)) for ch in channels]
    gray = channels[int(np.argmax(ranges))]

    # CLAHE — equalize contrast locally so uneven lighting / shadows don't matter
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    equalized = clahe.apply(gray)

    # Percentile stretch: map paper (bright) to 255, lines (dark) to 0
    low = float(np.percentile(equalized, 2))
    high = float(np.percentile(equalized, 98))
    if high - low < 30:
        # Very low contrast image — stretch harder
        low = float(np.percentile(equalized, 1))
        high = float(np.percentile(equalized, 99))
    if high <= low:
        return equalized

    stretched = np.clip((equalized.astype(np.float32) - low) / (high - low) * 255, 0, 255)
    normalized = stretched.astype(np.uint8)

    # If the image is inverted (dark background, light lines), flip it.
    # Check median of the image — paper is the majority, so median should be bright.
    if np.median(normalized) < 128:
        normalized = cv2.bitwise_not(normalized)

    return normalized


def detect_walls(image: np.ndarray) -> np.ndarray:
    """Detect wall lines via adaptive thresholding on a floor plan image.

    Args:
        image: BGR floor plan image (numpy array).

    Returns:
        Binary mask where 255 = wall pixel, 0 = non-wall.
    """
    # Normalize the scan first — handles photos, blueprints, dark paper, etc.
    gray = normalize_scan(image)

    # Adaptive threshold isolates dark lines (walls) against lighter background.
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15
    )

    # Extract only long straight lines (walls), filtering out text and symbols.
    # Walls in architectural drawings are long horizontal or vertical segments.
    # Text characters, dimension ticks, and symbols are short and irregular.
    h, w = image.shape[:2]
    line_len = max(20, min(h, w) // 50)

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (line_len, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)

    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, line_len))
    v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)

    # Combine horizontal and vertical wall segments
    walls = cv2.bitwise_or(h_lines, v_lines)

    # Thicken the detected lines slightly so they connect at corners
    thicken = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    walls = cv2.dilate(walls, thicken, iterations=1)

    return walls


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
