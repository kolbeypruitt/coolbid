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


class Vertex(BaseModel):
    x: float
    y: float


class RoomAnalysis(BaseModel):
    name: str
    type: str
    floor: int = 1
    unit: int | None = None
    estimated_sqft: float
    width_ft: float
    length_ft: float
    window_count: int = 0
    exterior_walls: int = 1
    ceiling_height: float = 9.0
    notes: str = ""
    polygon_id: str
    vertices: list[Vertex]
    bbox: BBox
    centroid: Point
    adjacent_rooms: list[str] = []


class BuildingAnalysis(BaseModel):
    stories: int = 1
    total_sqft: float
    units: int = 1
    has_garage: bool = False
    building_shape: str = "rectangle"
    unit_sqft: list[float] | None = None


class HvacNotes(BaseModel):
    suggested_equipment_location: str = ""
    suggested_zones: int = 1
    special_considerations: list[str] = []


class AnalysisResponse(BaseModel):
    floorplan_type: str = "residential floor plan"
    confidence: Literal["high", "medium", "low"] = "medium"
    building: BuildingAnalysis
    rooms: list[RoomAnalysis]
    hvac_notes: HvacNotes
    analysis_notes: str = ""
