import cv2
import numpy as np
from .types import RoomPolygon, Point, BBox, AdjacencyEdge


def extract_room_polygons(
    closed_wall_mask: np.ndarray,
    image_width: int,
    image_height: int,
    min_area_ratio: float = 0.005,
    max_area_ratio: float = 0.8,
) -> list[RoomPolygon]:
    """Extract room polygons from a closed wall mask using flood-fill + contours.

    Args:
        closed_wall_mask: Binary mask where 255 = wall.
        image_width: Original image width (for normalization).
        image_height: Original image height (for normalization).
        min_area_ratio: Minimum room area as fraction of image area.
        max_area_ratio: Maximum room area as fraction of image area (filters background).

    Returns:
        List of RoomPolygon with normalized (0-1) coordinates.
    """
    if image_width <= 0 or image_height <= 0:
        return []

    # Invert: we want room regions (non-wall) as foreground
    room_regions = cv2.bitwise_not(closed_wall_mask)

    # RETR_CCOMP gives a 2-level hierarchy: outer contours (rooms) at level 0,
    # holes inside them at level 1. The background is the largest level-0 contour
    # and gets filtered out by max_area_ratio.
    contours, hierarchy = cv2.findContours(room_regions, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

    if hierarchy is None or len(contours) == 0:
        return []

    image_area = image_width * image_height
    polygons: list[RoomPolygon] = []
    room_idx = 0

    for idx, contour in enumerate(contours):
        # Only process top-level contours (parent == -1); skip holes
        if hierarchy[0][idx][3] != -1:
            continue
        area = cv2.contourArea(contour)
        area_ratio = area / image_area

        # Filter by area: too small = artifact, too large = background
        if area_ratio < min_area_ratio or area_ratio > max_area_ratio:
            continue

        # Simplify contour to polygon
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        # Compute bounding box and centroid
        x, y, w, h = cv2.boundingRect(approx)
        moments = cv2.moments(approx)
        if moments["m00"] == 0:
            continue
        cx = moments["m10"] / moments["m00"]
        cy = moments["m01"] / moments["m00"]

        # Normalize all coordinates to 0-1
        vertices = [
            Point(x=float(pt[0][0]) / image_width, y=float(pt[0][1]) / image_height)
            for pt in approx
        ]

        polygon = RoomPolygon(
            id=f"room_{room_idx}",
            vertices=vertices,
            bbox=BBox(
                x=x / image_width,
                y=y / image_height,
                width=w / image_width,
                height=h / image_height,
            ),
            centroid=Point(x=cx / image_width, y=cy / image_height),
            area=area_ratio,
            adjacent_to=[],
        )
        polygons.append(polygon)
        room_idx += 1

    return polygons


def compute_adjacency(
    polygons: list[RoomPolygon],
    wall_thickness: float = 0.02,
) -> list[RoomPolygon]:
    """Compute room adjacency by checking if bounding boxes are within wall thickness.

    Two rooms are adjacent if their bounding box edges are parallel and within
    `wall_thickness` (normalized) of each other, AND they overlap along the
    shared axis by at least 20% of the smaller room's extent.

    Args:
        polygons: List of room polygons.
        wall_thickness: Maximum gap between edges to consider adjacent (normalized).

    Note:
        Only one adjacency direction is recorded per room pair. If two rooms
        share both a horizontal and vertical edge (e.g., L-shaped layouts),
        only the first detected direction is kept.

    Returns:
        Updated polygons with adjacent_to populated.
    """
    updated = [p.model_copy(update={"adjacent_to": []}) for p in polygons]

    for i in range(len(updated)):
        a = updated[i]
        a_left = a.bbox.x
        a_right = a.bbox.x + a.bbox.width
        a_top = a.bbox.y
        a_bottom = a.bbox.y + a.bbox.height

        for j in range(i + 1, len(updated)):
            b = updated[j]
            b_left = b.bbox.x
            b_right = b.bbox.x + b.bbox.width
            b_top = b.bbox.y
            b_bottom = b.bbox.y + b.bbox.height

            # Check vertical adjacency (rooms side by side)
            # A's right edge near B's left edge
            if abs(a_right - b_left) < wall_thickness:
                overlap = _vertical_overlap(a, b)
                if overlap > 0.2:
                    updated[i].adjacent_to.append(AdjacencyEdge(room_id=b.id, shared_edge="right"))
                    updated[j].adjacent_to.append(AdjacencyEdge(room_id=a.id, shared_edge="left"))
                    continue

            # B's right edge near A's left edge
            if abs(b_right - a_left) < wall_thickness:
                overlap = _vertical_overlap(a, b)
                if overlap > 0.2:
                    updated[i].adjacent_to.append(AdjacencyEdge(room_id=b.id, shared_edge="left"))
                    updated[j].adjacent_to.append(AdjacencyEdge(room_id=a.id, shared_edge="right"))
                    continue

            # Check horizontal adjacency (rooms stacked)
            # A's bottom edge near B's top edge
            if abs(a_bottom - b_top) < wall_thickness:
                overlap = _horizontal_overlap(a, b)
                if overlap > 0.2:
                    updated[i].adjacent_to.append(AdjacencyEdge(room_id=b.id, shared_edge="bottom"))
                    updated[j].adjacent_to.append(AdjacencyEdge(room_id=a.id, shared_edge="top"))
                    continue

            # B's bottom edge near A's top edge
            if abs(b_bottom - a_top) < wall_thickness:
                overlap = _horizontal_overlap(a, b)
                if overlap > 0.2:
                    updated[i].adjacent_to.append(AdjacencyEdge(room_id=b.id, shared_edge="top"))
                    updated[j].adjacent_to.append(AdjacencyEdge(room_id=a.id, shared_edge="bottom"))
                    continue

    return updated


def _vertical_overlap(a: RoomPolygon, b: RoomPolygon) -> float:
    """Fraction of vertical overlap between two rooms (0-1)."""
    a_top, a_bottom = a.bbox.y, a.bbox.y + a.bbox.height
    b_top, b_bottom = b.bbox.y, b.bbox.y + b.bbox.height
    overlap_start = max(a_top, b_top)
    overlap_end = min(a_bottom, b_bottom)
    if overlap_end <= overlap_start:
        return 0.0
    overlap_len = overlap_end - overlap_start
    min_height = min(a.bbox.height, b.bbox.height)
    return overlap_len / min_height if min_height > 0 else 0.0


def _horizontal_overlap(a: RoomPolygon, b: RoomPolygon) -> float:
    """Fraction of horizontal overlap between two rooms (0-1)."""
    a_left, a_right = a.bbox.x, a.bbox.x + a.bbox.width
    b_left, b_right = b.bbox.x, b.bbox.x + b.bbox.width
    overlap_start = max(a_left, b_left)
    overlap_end = min(a_right, b_right)
    if overlap_end <= overlap_start:
        return 0.0
    overlap_len = overlap_end - overlap_start
    min_width = min(a.bbox.width, b.bbox.width)
    return overlap_len / min_width if min_width > 0 else 0.0
