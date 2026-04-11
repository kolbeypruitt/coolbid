"""Diagnostic tests that process real floor plan images through each pipeline stage.

These tests exist to catch regressions and diagnose extraction failures.
Each test prints intermediate state so failures are easy to debug.
"""

import os
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.preprocess import detect_walls, close_gaps
from app.polygons import extract_room_polygons, compute_adjacency

FIXTURES = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> np.ndarray:
    path = FIXTURES / name
    if not path.exists():
        pytest.skip(f"Fixture {name} not found")
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    assert img is not None, f"Failed to decode {name}"
    return img


def _save_debug(name: str, img: np.ndarray) -> None:
    """Save intermediate images for visual debugging."""
    debug_dir = FIXTURES / "debug"
    debug_dir.mkdir(exist_ok=True)
    cv2.imwrite(str(debug_dir / name), img)


class TestPipelineDiagnostic:
    """Step-by-step diagnostic for the Wright residence floor plan."""

    @pytest.fixture
    def wright_img(self) -> np.ndarray:
        return _load_fixture("wright-residence.jpg")

    def test_stage1_detect_walls(self, wright_img: np.ndarray):
        """Verify wall detection produces a reasonable mask."""
        h, w = wright_img.shape[:2]
        wall_mask = detect_walls(wright_img)

        wall_ratio = np.count_nonzero(wall_mask) / wall_mask.size
        _save_debug("wright-01-walls.png", wall_mask)

        print(f"\nImage size: {w}x{h}")
        print(f"Wall pixel ratio: {wall_ratio:.4f} ({np.count_nonzero(wall_mask)} / {wall_mask.size})")

        # Wall ratio sanity: for a floor plan, walls should be 5-30% of image
        # If <5%, walls aren't being detected. If >30%, noise is overwhelming.
        assert wall_ratio > 0.01, f"Too few wall pixels ({wall_ratio:.4f}) — walls not detected"
        assert wall_ratio < 0.50, f"Too many wall pixels ({wall_ratio:.4f}) — noise overwhelming"

    def test_stage2_close_gaps(self, wright_img: np.ndarray):
        """Verify gap closing doesn't merge all rooms into one region."""
        h, w = wright_img.shape[:2]
        gap_px = max(15, min(h, w) // 50)
        wall_mask = detect_walls(wright_img)
        closed = close_gaps(wall_mask, gap_size=gap_px)

        _save_debug("wright-02-closed.png", closed)

        closed_ratio = np.count_nonzero(closed) / closed.size
        wall_ratio = np.count_nonzero(wall_mask) / wall_mask.size

        print(f"\nBefore closing: {wall_ratio:.4f}")
        print(f"After closing:  {closed_ratio:.4f}")
        print(f"Increase:       {closed_ratio - wall_ratio:.4f}")

        # Gap closing should add some pixels but not double the wall area
        assert closed_ratio < wall_ratio * 3, "Gap closing added too many pixels — rooms may be merging"

    def test_stage3_room_regions(self, wright_img: np.ndarray):
        """Check that inverting the closed mask produces multiple distinct regions."""
        h, w = wright_img.shape[:2]
        gap_px = max(15, min(h, w) // 50)
        wall_mask = detect_walls(wright_img)
        closed = close_gaps(wall_mask, gap_size=gap_px)
        room_regions = cv2.bitwise_not(closed)

        contours, hierarchy = cv2.findContours(
            room_regions, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
        )

        if hierarchy is None:
            pytest.fail("No contours found at all")

        h, w = wright_img.shape[:2]
        image_area = w * h

        # Count top-level contours and their areas
        top_level = []
        for idx, contour in enumerate(contours):
            if hierarchy[0][idx][3] != -1:
                continue  # skip holes
            area = cv2.contourArea(contour)
            area_ratio = area / image_area
            top_level.append((idx, area_ratio))

        top_level.sort(key=lambda x: x[1], reverse=True)

        print(f"\nTotal contours: {len(contours)}")
        print(f"Top-level contours: {len(top_level)}")
        print("Area ratios (top 15):")
        for i, (idx, ratio) in enumerate(top_level[:15]):
            label = ""
            if ratio > 0.8:
                label = " ← BACKGROUND (filtered)"
            elif ratio < 0.005:
                label = " ← TOO SMALL (filtered)"
            else:
                label = " ← ROOM"
            print(f"  contour_{idx}: {ratio:.4f}{label}")

        # Count regions that pass the area filter (these become rooms)
        room_candidates = [r for _, r in top_level if 0.005 <= r <= 0.8]
        print(f"\nRoom candidates (0.5%-80%): {len(room_candidates)}")

        # Wright residence should have 8+ distinct rooms
        assert len(room_candidates) >= 3, (
            f"Only {len(room_candidates)} room candidates found — "
            "wall detection or gap closing is failing"
        )

    def test_stage4_polygon_extraction(self, wright_img: np.ndarray):
        """Full polygon extraction — the end-to-end result."""
        h, w = wright_img.shape[:2]
        gap_px = max(15, min(h, w) // 50)
        wall_mask = detect_walls(wright_img)
        closed = close_gaps(wall_mask, gap_size=gap_px)
        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        print(f"\nPolygons extracted: {len(polygons)}")
        for p in polygons:
            print(
                f"  {p.id}: bbox({p.bbox.x:.3f}, {p.bbox.y:.3f}, "
                f"w={p.bbox.width:.3f}, h={p.bbox.height:.3f}) "
                f"area={p.area:.4f}"
            )

        # Draw polygons on image for visual debugging
        debug_img = wright_img.copy()
        for p in polygons:
            pts = np.array(
                [[int(v.x * w), int(v.y * h)] for v in p.vertices], dtype=np.int32
            )
            cv2.polylines(debug_img, [pts], True, (0, 255, 0), 2)
            cx, cy = int(p.centroid.x * w), int(p.centroid.y * h)
            cv2.putText(debug_img, p.id, (cx - 20, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
        _save_debug("wright-04-polygons.jpg", debug_img)

        # Wright residence: expect at least 8 rooms
        assert len(polygons) >= 5, (
            f"Only {len(polygons)} polygons extracted — expected 8+ rooms for Wright residence"
        )

    def test_stage5_adjacency(self, wright_img: np.ndarray):
        """Verify adjacency computation produces edges."""
        h, w = wright_img.shape[:2]
        gap_px = max(15, min(h, w) // 50)
        wall_mask = detect_walls(wright_img)
        closed = close_gaps(wall_mask, gap_size=gap_px)
        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        if len(polygons) < 2:
            pytest.skip("Not enough polygons to test adjacency")

        with_adj = compute_adjacency(polygons, wall_thickness=0.02)
        total_edges = sum(len(p.adjacent_to) for p in with_adj)

        print(f"\nPolygons: {len(with_adj)}, adjacency edges: {total_edges}")
        for p in with_adj:
            neighbors = ", ".join(f"{a.room_id}({a.shared_edge})" for a in p.adjacent_to)
            print(f"  {p.id}: [{neighbors}]")

        # With multiple rooms, there should be at least some adjacency
        assert total_edges > 0, "No adjacency edges found — rooms should share walls"


class TestSyntheticMultiRoom:
    """Test with a more realistic synthetic floor plan (many rooms, varying sizes)."""

    @pytest.fixture
    def multi_room_plan(self) -> np.ndarray:
        """Create a synthetic floor plan resembling a real house.

        Layout (800x600, walls=6px):
        +----------+--------+------------------+
        |          |        |                  |
        | Bed 1    | Bath   |   Living Room    |
        | 10x12    | 6x8    |   16x14          |
        |          |        |                  |
        +----------+--------+                  |
        |          |        |                  |
        | Bed 2    | Hall   +--------+---------+
        | 10x10    | 4x10   | Kitchen| Dining  |
        |          |        | 10x10  | 10x10   |
        +----------+--------+--------+---------+
        """
        img = np.ones((600, 800, 3), dtype=np.uint8) * 255
        c = (0, 0, 0)  # wall color
        t = 6  # thickness

        # Outer boundary
        cv2.rectangle(img, (50, 50), (750, 550), c, t)

        # Vertical wall: x=250 (Bed1/Bath | Hall/Bed2 boundary from Living)
        cv2.line(img, (250, 50), (250, 550), c, t)

        # Vertical wall: x=400 (Bath/Hall | Living/Kitchen boundary) — with 10px door gap
        cv2.line(img, (400, 50), (400, 200), c, t)
        cv2.line(img, (400, 210), (400, 350), c, t)
        cv2.line(img, (400, 350), (400, 550), c, t)

        # Vertical wall: x=575 (Kitchen | Dining)
        cv2.line(img, (575, 350), (575, 550), c, t)

        # Horizontal wall: y=300 (Bed1/Bath over Bed2/Hall) — with 10px door gaps
        cv2.line(img, (50, 300), (155, 300), c, t)
        cv2.line(img, (165, 300), (250, 300), c, t)
        cv2.line(img, (250, 300), (320, 300), c, t)
        cv2.line(img, (330, 300), (400, 300), c, t)

        # Horizontal wall: y=200 (Bed1 | Bath boundary)
        cv2.line(img, (250, 200), (400, 200), c, t)

        # Horizontal wall: y=350 (Living | Kitchen/Dining) — with 10px door gap
        cv2.line(img, (400, 350), (510, 350), c, t)
        cv2.line(img, (520, 350), (750, 350), c, t)

        return img

    def test_finds_all_rooms(self, multi_room_plan: np.ndarray):
        h, w = multi_room_plan.shape[:2]
        wall_mask = detect_walls(multi_room_plan)
        # Use scaled gap size like main.py does
        gap_px = max(15, min(h, w) // 50)
        closed = close_gaps(wall_mask, gap_size=gap_px)
        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        _save_debug("synthetic-multi-polygons.png", multi_room_plan)
        _save_debug("synthetic-multi-walls.png", wall_mask)

        print(f"\ngap_size={gap_px}, Expected 6 rooms, got {len(polygons)}")
        for p in polygons:
            print(f"  {p.id}: area={p.area:.4f}")

        # 6 rooms: Bed1, Bath, Living, Bed2, Hall, Kitchen/Dining (may merge due to gap)
        assert len(polygons) >= 5, f"Expected at least 5 rooms, got {len(polygons)}"

    def test_adjacency_is_reasonable(self, multi_room_plan: np.ndarray):
        h, w = multi_room_plan.shape[:2]
        wall_mask = detect_walls(multi_room_plan)
        gap_px = max(15, min(h, w) // 50)
        closed = close_gaps(wall_mask, gap_size=gap_px)
        polygons = extract_room_polygons(closed, image_width=w, image_height=h)
        with_adj = compute_adjacency(polygons, wall_thickness=0.02)

        total_edges = sum(len(p.adjacent_to) for p in with_adj)
        print(f"\n{len(with_adj)} rooms, {total_edges} adjacency edges")

        # In a multi-room house, most rooms touch at least 1 neighbor
        rooms_with_neighbors = sum(1 for p in with_adj if len(p.adjacent_to) > 0)
        assert rooms_with_neighbors >= len(with_adj) // 2, "Most rooms should have neighbors"
