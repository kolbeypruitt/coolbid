"""Validate and enrich the LLM's raw floor-plan analysis.

The LLM provides polygon vertices; this module clamps them to the unit
square, derives bbox/centroid via shapely, drops degenerate polygons,
and returns a validated Pydantic AnalysisResponse ready for transport.
"""
from __future__ import annotations

import logging
from typing import Any

from shapely.geometry import Polygon

from .types import (
    AnalysisResponse,
    BBox,
    Point,
    RoomAnalysis,
    Vertex,
)

logger = logging.getLogger(__name__)


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _clean_vertices(raw: list[dict[str, Any]]) -> list[Vertex]:
    out: list[Vertex] = []
    for v in raw:
        try:
            x = _clamp01(float(v["x"]))
            y = _clamp01(float(v["y"]))
        except (KeyError, TypeError, ValueError):
            # Malformed vertex — skip it; downstream `_to_shapely` drops the
            # room if too few vertices survive.
            continue
        out.append(Vertex(x=x, y=y))
    return out


def _to_shapely(verts: list[Vertex]) -> Polygon | None:
    if len(verts) < 3:
        return None
    poly = Polygon([(v.x, v.y) for v in verts])
    if not poly.is_valid:
        poly = poly.buffer(0)
        if poly.is_empty or poly.geom_type != "Polygon":
            return None
    if poly.area <= 0.0001:  # less than 0.01% of image — drop as noise
        return None
    return poly


def postprocess_analysis(raw: dict[str, Any]) -> AnalysisResponse:
    """Turn the raw LLM JSON into a validated AnalysisResponse."""
    rooms_in = raw.get("rooms") or []
    cleaned: list[dict[str, Any]] = []

    for idx, room in enumerate(rooms_in):
        verts_raw = room.get("vertices") or []
        verts = _clean_vertices(verts_raw)
        poly = _to_shapely(verts)
        if poly is None:
            logger.info(
                "Dropping room %r: degenerate polygon (%d vertices)",
                room.get("name"),
                len(verts),
            )
            continue

        minx, miny, maxx, maxy = poly.bounds
        centroid = poly.centroid

        polygon_id = room.get("polygon_id") or f"room_{idx}"

        cleaned.append(
            {
                **room,
                "polygon_id": polygon_id,
                "vertices": [v.model_dump() for v in verts],
                "bbox": BBox(
                    x=minx, y=miny, width=maxx - minx, height=maxy - miny
                ).model_dump(),
                "centroid": Point(x=centroid.x, y=centroid.y).model_dump(),
            }
        )

    if not cleaned:
        raise ValueError("Analysis must contain at least one room with a valid polygon")

    # Re-number polygon_ids to keep them dense and stable after drops.
    for i, room in enumerate(cleaned):
        room["polygon_id"] = f"room_{i}"

    return AnalysisResponse.model_validate({**raw, "rooms": cleaned})
