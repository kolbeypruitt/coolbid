import type { RoomType } from "./hvac";

export type LayoutRoom = {
  id: string;
  name: string;
  type: RoomType;
  floor: number;
  /** Bounding box in SVG coords — used for duct routing and register placement. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Full polygon in SVG coords — at least 3 points when the LLM detected a
   * polygon, otherwise empty and the consumer falls back to the bbox rect.
   */
  polygon: { x: number; y: number }[];
  sqft: number;
  cfm: number;
  regs: number;
  hasReturn: boolean;
  registerPositions: { x: number; y: number }[];
};

export type DuctSegment = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: "trunk" | "branch";
  size: string;
};

export type FloorLabel = {
  label: string;
  y: number;
};

export type FloorplanLayout = {
  rooms: LayoutRoom[];
  ducts: DuctSegment[];
  equipment: { x: number; y: number; label: string };
  viewBox: { width: number; height: number };
  floorLabels: FloorLabel[];
};
