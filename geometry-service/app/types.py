from typing import Literal

from pydantic import BaseModel


class Point(BaseModel):
    x: float
    y: float


class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class AdjacencyEdge(BaseModel):
    room_id: str
    shared_edge: Literal["top", "bottom", "left", "right"]


class RoomPolygon(BaseModel):
    id: str
    vertices: list[Point]
    bbox: BBox
    centroid: Point
    area: float
    adjacent_to: list[AdjacencyEdge]


class GeometryResult(BaseModel):
    polygons: list[RoomPolygon]
    image_width: int
    image_height: int
