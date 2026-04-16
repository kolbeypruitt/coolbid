import pytest

from app.postprocess import postprocess_analysis
from app.types import AnalysisResponse


def _base_room(polygon_id: str, vertices: list[dict], name: str = "Room"):
    return {
        "name": name,
        "type": "bedroom",
        "floor": 1,
        "estimated_sqft": 200,
        "width_ft": 10,
        "length_ft": 20,
        "window_count": 1,
        "exterior_walls": 1,
        "ceiling_height": 9,
        "notes": "",
        "polygon_id": polygon_id,
        "vertices": vertices,
        "adjacent_rooms": [],
    }


def _base_payload(rooms: list[dict]) -> dict:
    return {
        "floorplan_type": "residential",
        "confidence": "medium",
        "building": {
            "stories": 1,
            "total_sqft": 1000,
            "units": 1,
            "has_garage": False,
            "building_shape": "rectangle",
        },
        "rooms": rooms,
        "hvac_notes": {
            "suggested_equipment_location": "",
            "suggested_zones": 1,
            "special_considerations": [],
        },
        "analysis_notes": "",
    }


def test_computes_bbox_and_centroid_from_vertices():
    verts = [
        {"x": 0.1, "y": 0.2},
        {"x": 0.3, "y": 0.2},
        {"x": 0.3, "y": 0.5},
        {"x": 0.1, "y": 0.5},
    ]
    payload = _base_payload([_base_room("room_0", verts)])
    result = postprocess_analysis(payload)
    room = result.rooms[0]
    assert room.bbox.x == pytest.approx(0.1)
    assert room.bbox.y == pytest.approx(0.2)
    assert room.bbox.width == pytest.approx(0.2)
    assert room.bbox.height == pytest.approx(0.3)
    assert room.centroid.x == pytest.approx(0.2)
    assert room.centroid.y == pytest.approx(0.35)


def test_clamps_vertices_to_unit_square():
    verts = [
        {"x": -0.1, "y": 0.0},
        {"x": 1.2, "y": 0.0},
        {"x": 1.2, "y": 0.5},
        {"x": -0.1, "y": 0.5},
    ]
    payload = _base_payload([_base_room("room_0", verts)])
    result = postprocess_analysis(payload)
    for v in result.rooms[0].vertices:
        assert 0.0 <= v.x <= 1.0
        assert 0.0 <= v.y <= 1.0


def test_drops_rooms_with_degenerate_polygons():
    # Fewer than 3 vertices = not a polygon.
    bad = _base_room("room_0", [{"x": 0.1, "y": 0.1}, {"x": 0.2, "y": 0.2}])
    good = _base_room("room_1", [
        {"x": 0.3, "y": 0.3}, {"x": 0.5, "y": 0.3},
        {"x": 0.5, "y": 0.5}, {"x": 0.3, "y": 0.5},
    ], name="Keep")
    payload = _base_payload([bad, good])
    result = postprocess_analysis(payload)
    assert [r.name for r in result.rooms] == ["Keep"]


def test_assigns_stable_polygon_ids_when_missing():
    verts = [
        {"x": 0.1, "y": 0.2}, {"x": 0.3, "y": 0.2},
        {"x": 0.3, "y": 0.5}, {"x": 0.1, "y": 0.5},
    ]
    room = _base_room("", verts)
    payload = _base_payload([room])
    result = postprocess_analysis(payload)
    assert result.rooms[0].polygon_id == "room_0"


def test_requires_at_least_one_room():
    payload = _base_payload([])
    with pytest.raises(ValueError, match="at least one room"):
        postprocess_analysis(payload)
