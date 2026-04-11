import type { RoomType } from "./hvac";

export type LayoutRoom = {
  id: string;
  name: string;
  type: RoomType;
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
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
