import cv2
import numpy as np
import pytest


@pytest.fixture
def simple_floorplan() -> np.ndarray:
    """Create a synthetic 800x600 floor plan image with 4 rooms.

    Layout (white background, black walls):
    +-------------------+-------------------+
    |                   |                   |
    |    Room A         |    Room B         |
    |    (200x150)      |    (200x150)      |
    |                   |                   |
    +-------------------+-------------------+
    |                   |                   |
    |    Room C         |    Room D         |
    |    (200x150)      |    (200x150)      |
    |                   |                   |
    +-------------------+-------------------+

    Walls are 6px thick black lines. Small 10px gaps for doorways.
    """
    img = np.ones((600, 800, 3), dtype=np.uint8) * 255
    wall_color = (0, 0, 0)
    t = 6  # wall thickness

    # Outer walls
    cv2.rectangle(img, (100, 75), (700, 525), wall_color, t)

    # Vertical center wall (with 10px door gap at y=280-290)
    cv2.line(img, (400, 75), (400, 280), wall_color, t)
    cv2.line(img, (400, 290), (400, 525), wall_color, t)

    # Horizontal center wall (with 10px door gap at x=250-260)
    cv2.line(img, (100, 300), (250, 300), wall_color, t)
    cv2.line(img, (260, 300), (700, 300), wall_color, t)

    return img


@pytest.fixture
def empty_image() -> np.ndarray:
    """A blank white image with no walls."""
    return np.ones((400, 400, 3), dtype=np.uint8) * 255
