import { describe, it, expect } from "vitest";
import { generateFloorplanLayout } from "../floorplan-layout";
import type { RoomLoad, BomSummary } from "@/types/hvac";

function makeRoom(overrides: Partial<RoomLoad> = {}): RoomLoad {
  return {
    name: "Living Room",
    type: "living_room",
    floor: 1,
    estimated_sqft: 300,
    width_ft: 15,
    length_ft: 20,
    window_count: 2,
    exterior_walls: 2,
    ceiling_height: 9,
    notes: "",
    conditioned: true,
    btu: 8000,
    cfm: 300,
    regs: 2,
    polygon_id: "room_0",
    bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
    centroid: { x: 0.3, y: 0.3 },
    adjacent_rooms: ["Kitchen"],
    ...overrides,
  };
}

const baseSummary: BomSummary = {
  designBTU: 42000, tonnage: 3.5, totalCFM: 1200, totalRegs: 8,
  retCount: 3, condSqft: 1200, zones: 1,
};

describe("generateFloorplanLayout (single floor)", () => {
  const rooms: RoomLoad[] = [
    makeRoom({
      name: "Living Room", type: "living_room", estimated_sqft: 320, regs: 2,
      polygon_id: "room_0", bbox: { x: 0.05, y: 0.05, width: 0.45, height: 0.45 },
      centroid: { x: 0.275, y: 0.275 }, adjacent_rooms: ["Kitchen", "Hallway"],
    }),
    makeRoom({
      name: "Kitchen", type: "kitchen", estimated_sqft: 210, regs: 1,
      polygon_id: "room_1", bbox: { x: 0.5, y: 0.05, width: 0.45, height: 0.45 },
      centroid: { x: 0.725, y: 0.275 }, adjacent_rooms: ["Living Room", "Bedroom 2"],
    }),
    makeRoom({
      name: "Master Bedroom", type: "master_bedroom", estimated_sqft: 250, regs: 2,
      polygon_id: "room_2", bbox: { x: 0.05, y: 0.5, width: 0.45, height: 0.45 },
      centroid: { x: 0.275, y: 0.725 }, adjacent_rooms: ["Living Room"],
    }),
    makeRoom({
      name: "Bedroom 2", type: "bedroom", estimated_sqft: 160, regs: 1,
      polygon_id: "room_3", bbox: { x: 0.5, y: 0.5, width: 0.45, height: 0.45 },
      centroid: { x: 0.725, y: 0.725 }, adjacent_rooms: ["Kitchen"],
    }),
  ];

  it("maps rooms to SVG coordinates from bbox data", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    const living = layout.rooms.find((r) => r.name === "Living Room")!;
    expect(living.x).toBeGreaterThan(0);
    expect(living.x).toBeLessThan(200);
    const kitchen = layout.rooms.find((r) => r.name === "Kitchen")!;
    expect(kitchen.x).toBeGreaterThan(150);
  });

  it("preserves relative room positions", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    const living = layout.rooms.find((r) => r.name === "Living Room")!;
    const kitchen = layout.rooms.find((r) => r.name === "Kitchen")!;
    const master = layout.rooms.find((r) => r.name === "Master Bedroom")!;
    const bed2 = layout.rooms.find((r) => r.name === "Bedroom 2")!;
    expect(kitchen.x).toBeGreaterThan(living.x);
    expect(master.y).toBeGreaterThan(living.y);
    expect(bed2.y).toBeGreaterThan(kitchen.y);
  });

  it("all rooms fit within the SVG viewbox", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    for (const room of layout.rooms) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.y).toBeGreaterThanOrEqual(0);
      expect(room.x + room.width).toBeLessThanOrEqual(layout.viewBox.width);
      expect(room.y + room.height).toBeLessThanOrEqual(layout.viewBox.height);
    }
  });

  it("places register dots within room bounds", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    for (const room of layout.rooms) {
      for (const pos of room.registerPositions) {
        expect(pos.x).toBeGreaterThanOrEqual(room.x);
        expect(pos.x).toBeLessThanOrEqual(room.x + room.width);
        expect(pos.y).toBeGreaterThanOrEqual(room.y);
        expect(pos.y).toBeLessThanOrEqual(room.y + room.height);
      }
    }
  });

  it("generates trunk and branch duct segments", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    const trunks = layout.ducts.filter((d) => d.type === "trunk");
    const branches = layout.ducts.filter((d) => d.type === "branch");
    expect(trunks.length).toBeGreaterThanOrEqual(1);
    expect(branches.length).toBeGreaterThanOrEqual(1);
  });

  it("has no floor labels for single-floor plan", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    expect(layout.floorLabels).toHaveLength(0);
  });

  it("excludes garage and closet from layout", () => {
    const withGarage = [
      ...rooms,
      makeRoom({
        name: "Garage", type: "garage", cfm: 0, regs: 0, btu: 0,
        polygon_id: "room_4", bbox: { x: 0.0, y: 0.0, width: 0.2, height: 0.2 },
        centroid: { x: 0.1, y: 0.1 }, adjacent_rooms: [],
      }),
    ];
    const layout = generateFloorplanLayout(withGarage, baseSummary);
    expect(layout.rooms.map((r) => r.name)).not.toContain("Garage");
  });
});

describe("generateFloorplanLayout (multi-floor)", () => {
  const twoStoryRooms: RoomLoad[] = [
    // Floor 1
    makeRoom({
      name: "Living", type: "living_room", floor: 1, estimated_sqft: 330, regs: 2,
      polygon_id: "room_0", bbox: { x: 0.05, y: 0.55, width: 0.4, height: 0.4 },
    }),
    makeRoom({
      name: "Kitchen", type: "kitchen", floor: 1, estimated_sqft: 250, regs: 1,
      polygon_id: "room_1", bbox: { x: 0.5, y: 0.55, width: 0.45, height: 0.4 },
    }),
    makeRoom({
      name: "Half Bath", type: "half_bath", floor: 1, estimated_sqft: 35, regs: 0, cfm: 30,
      polygon_id: "room_2", bbox: { x: 0.05, y: 0.45, width: 0.15, height: 0.1 },
    }),
    // Floor 2
    makeRoom({
      name: "Bedroom #1", type: "master_bedroom", floor: 2, estimated_sqft: 200, regs: 2,
      polygon_id: "room_3", bbox: { x: 0.05, y: 0.05, width: 0.4, height: 0.35 },
    }),
    makeRoom({
      name: "Bedroom #2", type: "bedroom", floor: 2, estimated_sqft: 180, regs: 1,
      polygon_id: "room_4", bbox: { x: 0.5, y: 0.05, width: 0.45, height: 0.35 },
    }),
    makeRoom({
      name: "Bath", type: "bathroom", floor: 2, estimated_sqft: 60, regs: 1, cfm: 50,
      polygon_id: "room_5", bbox: { x: 0.25, y: 0.05, width: 0.2, height: 0.15 },
    }),
  ];

  it("produces floor labels for each floor", () => {
    const layout = generateFloorplanLayout(twoStoryRooms, baseSummary);
    expect(layout.floorLabels).toHaveLength(2);
    expect(layout.floorLabels[0].label).toBe("Floor 1");
    expect(layout.floorLabels[1].label).toBe("Floor 2");
  });

  it("floor 2 rooms are positioned below floor 1 rooms", () => {
    const layout = generateFloorplanLayout(twoStoryRooms, baseSummary);
    const floor1Rooms = layout.rooms.filter((r) => r.floor === 1);
    const floor2Rooms = layout.rooms.filter((r) => r.floor === 2);

    const maxY1 = Math.max(...floor1Rooms.map((r) => r.y + r.height));
    const minY2 = Math.min(...floor2Rooms.map((r) => r.y));

    expect(minY2).toBeGreaterThan(maxY1);
  });

  it("rooms on each floor fill their section", () => {
    const layout = generateFloorplanLayout(twoStoryRooms, baseSummary);

    // Floor 1 rooms should span a reasonable width
    const floor1 = layout.rooms.filter((r) => r.floor === 1);
    const f1Left = Math.min(...floor1.map((r) => r.x));
    const f1Right = Math.max(...floor1.map((r) => r.x + r.width));
    expect(f1Right - f1Left).toBeGreaterThan(100);

    // Floor 2 rooms should also span
    const floor2 = layout.rooms.filter((r) => r.floor === 2);
    const f2Left = Math.min(...floor2.map((r) => r.x));
    const f2Right = Math.max(...floor2.map((r) => r.x + r.width));
    expect(f2Right - f2Left).toBeGreaterThan(100);
  });

  it("viewBox height increases for multi-floor", () => {
    const singleFloor = generateFloorplanLayout(
      twoStoryRooms.filter((r) => r.floor === 1),
      baseSummary,
    );
    const twoFloor = generateFloorplanLayout(twoStoryRooms, baseSummary);
    expect(twoFloor.viewBox.height).toBeGreaterThan(singleFloor.viewBox.height);
  });

  it("generates separate trunk lines per floor", () => {
    const layout = generateFloorplanLayout(twoStoryRooms, baseSummary);
    const trunks = layout.ducts.filter((d) => d.type === "trunk");
    // At least 2 horizontal trunks (one per floor) + 1 equipment connection
    expect(trunks.length).toBeGreaterThanOrEqual(3);
  });

  it("all rooms fit within viewbox", () => {
    const layout = generateFloorplanLayout(twoStoryRooms, baseSummary);
    for (const room of layout.rooms) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.y).toBeGreaterThanOrEqual(0);
      expect(room.x + room.width).toBeLessThanOrEqual(layout.viewBox.width);
      expect(room.y + room.height).toBeLessThanOrEqual(layout.viewBox.height);
    }
  });
});
