from unittest.mock import AsyncMock, patch

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _jpeg_bytes(w: int = 1000, h: int = 800) -> bytes:
    img = np.full((h, w, 3), 200, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "anthropic_key_set" in body


def test_analyze_rejects_invalid_image():
    response = client.post(
        "/analyze",
        content=b"not an image",
        headers={"Content-Type": "image/jpeg"},
    )
    assert response.status_code == 422


def test_analyze_rejects_empty_body():
    response = client.post("/analyze", content=b"", headers={"Content-Type": "image/jpeg"})
    assert response.status_code == 400


@patch("app.main.analyze_floor_plan", new_callable=AsyncMock)
def test_analyze_happy_path(mock_vision):
    mock_vision.return_value = {
        "floorplan_type": "residential",
        "confidence": "high",
        "building": {
            "stories": 1,
            "total_sqft": 1000,
            "units": 1,
            "has_garage": False,
            "building_shape": "rectangle",
        },
        "rooms": [
            {
                "name": "Living Room",
                "type": "living_room",
                "floor": 1,
                "estimated_sqft": 300,
                "width_ft": 15,
                "length_ft": 20,
                "window_count": 2,
                "exterior_walls": 2,
                "ceiling_height": 9,
                "notes": "",
                "polygon_id": "room_0",
                "vertices": [
                    {"x": 0.1, "y": 0.1}, {"x": 0.5, "y": 0.1},
                    {"x": 0.5, "y": 0.4}, {"x": 0.1, "y": 0.4},
                ],
                "adjacent_rooms": [],
            }
        ],
        "hvac_notes": {
            "suggested_equipment_location": "attic",
            "suggested_zones": 1,
            "special_considerations": [],
        },
        "analysis_notes": "",
    }

    response = client.post(
        "/analyze",
        content=_jpeg_bytes(),
        headers={"Content-Type": "image/jpeg"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["rooms"]) == 1
    assert body["rooms"][0]["polygon_id"] == "room_0"
    assert body["rooms"][0]["bbox"]["width"] == pytest.approx(0.4)


@patch("app.main.analyze_floor_plan", new_callable=AsyncMock)
def test_analyze_returns_422_on_no_valid_rooms(mock_vision):
    mock_vision.return_value = {
        "floorplan_type": "residential",
        "confidence": "low",
        "building": {
            "stories": 1, "total_sqft": 0, "units": 1,
            "has_garage": False, "building_shape": "unknown",
        },
        "rooms": [],  # no rooms
        "hvac_notes": {
            "suggested_equipment_location": "",
            "suggested_zones": 1,
            "special_considerations": [],
        },
        "analysis_notes": "",
    }

    response = client.post(
        "/analyze",
        content=_jpeg_bytes(),
        headers={"Content-Type": "image/jpeg"},
    )
    assert response.status_code == 422
