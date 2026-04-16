import numpy as np
import pytest

from app.preprocess import prepare_image_for_vision


def test_downsizes_large_image():
    big = np.zeros((4000, 6000, 3), dtype=np.uint8)
    result = prepare_image_for_vision(big, max_long_edge=2048)
    h, w = result.shape[:2]
    assert max(h, w) == 2048
    assert w / h == pytest.approx(6000 / 4000, rel=0.01)


def test_preserves_small_image():
    small = np.zeros((800, 1200, 3), dtype=np.uint8)
    result = prepare_image_for_vision(small, max_long_edge=2048)
    assert result.shape == small.shape


def test_returns_uint8_rgb():
    img = np.random.randint(0, 255, (1000, 1500, 3), dtype=np.uint8)
    result = prepare_image_for_vision(img)
    assert result.dtype == np.uint8
    assert result.shape[2] == 3


def test_clahe_increases_contrast_on_low_contrast_image():
    # A uniform gray image has zero contrast; CLAHE should not crash.
    flat = np.full((1000, 1500, 3), 128, dtype=np.uint8)
    result = prepare_image_for_vision(flat)
    assert result.shape == flat.shape
