import numpy as np
from app.preprocess import detect_walls, close_gaps


def test_detect_walls_finds_dark_lines(simple_floorplan: np.ndarray):
    wall_mask = detect_walls(simple_floorplan)

    # Wall mask should be binary (0 or 255)
    unique = np.unique(wall_mask)
    assert set(unique).issubset({0, 255})

    # Walls should be detected (white pixels in mask)
    wall_pixels = np.count_nonzero(wall_mask)
    assert wall_pixels > 0

    # Check that wall locations have mask pixels
    # Center vertical wall at x=400 should be detected
    center_col = wall_mask[:, 400]
    assert np.any(center_col > 0)


def test_detect_walls_returns_empty_for_blank(empty_image: np.ndarray):
    wall_mask = detect_walls(empty_image)
    # Blank image should have very few or no wall pixels
    wall_ratio = np.count_nonzero(wall_mask) / wall_mask.size
    assert wall_ratio < 0.01


def test_close_gaps_fills_doorways(simple_floorplan: np.ndarray):
    wall_mask = detect_walls(simple_floorplan)
    closed = close_gaps(wall_mask, gap_size=15)

    # After closing, the horizontal wall at y=300 should be continuous
    # (the 10px door gap should be filled by a 15px kernel)
    row = closed[300, 100:700]
    # Most of the row should be wall (allowing some tolerance)
    wall_fraction = np.count_nonzero(row) / len(row)
    assert wall_fraction > 0.85
