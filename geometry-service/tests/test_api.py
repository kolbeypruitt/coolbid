import cv2
import numpy as np
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
def simple_floorplan_bytes(simple_floorplan: np.ndarray) -> bytes:
    """Encode the synthetic floor plan fixture as JPEG bytes."""
    _, buf = cv2.imencode(".jpg", simple_floorplan)
    return buf.tobytes()


@pytest.mark.anyio
async def test_extract_geometry_returns_polygons(simple_floorplan_bytes: bytes):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/extract-geometry",
            files={"image": ("plan.jpg", simple_floorplan_bytes, "image/jpeg")},
        )

    assert response.status_code == 200
    data = response.json()
    assert "polygons" in data
    assert len(data["polygons"]) == 4
    assert "image_width" in data
    assert "image_height" in data


@pytest.mark.anyio
async def test_extract_geometry_fails_on_blank_image(empty_image: np.ndarray):
    _, buf = cv2.imencode(".jpg", empty_image)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/extract-geometry",
            files={"image": ("blank.jpg", buf.tobytes(), "image/jpeg")},
        )

    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


@pytest.mark.anyio
async def test_extract_geometry_rejects_missing_file():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/extract-geometry")

    assert response.status_code == 422
