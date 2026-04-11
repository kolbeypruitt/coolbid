import cv2
import numpy as np
import pytest
from app.preprocess import detect_walls, close_gaps
from app.polygons import extract_room_polygons, compute_adjacency
from app.types import RoomPolygon


class TestExtractRoomPolygons:
    def test_finds_rooms_in_simple_floorplan(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        # Should find 4 rooms (the synthetic plan has 4 quadrants)
        assert len(polygons) == 4

    def test_polygons_have_normalized_coordinates(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        for poly in polygons:
            assert 0 <= poly.bbox.x <= 1
            assert 0 <= poly.bbox.y <= 1
            assert 0 < poly.bbox.width <= 1
            assert 0 < poly.bbox.height <= 1
            assert 0 <= poly.centroid.x <= 1
            assert 0 <= poly.centroid.y <= 1
            for v in poly.vertices:
                assert 0 <= v.x <= 1
                assert 0 <= v.y <= 1

    def test_polygons_have_unique_ids(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)
        ids = [p.id for p in polygons]
        assert len(ids) == len(set(ids))

    def test_filters_tiny_regions(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        # min_area_ratio filters out regions smaller than threshold
        polygons = extract_room_polygons(
            closed, image_width=w, image_height=h, min_area_ratio=0.5
        )

        # All 4 rooms are ~equal size (~0.125 of image each), so with 0.5 threshold all filtered
        assert len(polygons) == 0

    def test_returns_empty_for_blank_image(self, empty_image: np.ndarray):
        wall_mask = detect_walls(empty_image)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = empty_image.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)

        # Blank image has no enclosed rooms (just one big region = background)
        assert len(polygons) == 0


class TestComputeAdjacency:
    def test_adjacent_rooms_share_edges(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)
        with_adj = compute_adjacency(polygons, wall_thickness=0.02)

        # In a 2x2 grid, each corner room should be adjacent to 2 others
        for poly in with_adj:
            assert len(poly.adjacent_to) == 2

    def test_no_self_adjacency(self, simple_floorplan: np.ndarray):
        wall_mask = detect_walls(simple_floorplan)
        closed = close_gaps(wall_mask, gap_size=15)
        h, w = simple_floorplan.shape[:2]

        polygons = extract_room_polygons(closed, image_width=w, image_height=h)
        with_adj = compute_adjacency(polygons, wall_thickness=0.02)

        for poly in with_adj:
            neighbor_ids = [a.room_id for a in poly.adjacent_to]
            assert poly.id not in neighbor_ids
