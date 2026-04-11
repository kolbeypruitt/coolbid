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
    btu: 8000,
    cfm: 300,
    regs: 2,
    ...overrides,
  };
}

const baseSummary: BomSummary = {
  designBTU: 42000,
  tonnage: 3.5,
  totalCFM: 1200,
  totalRegs: 8,
  retCount: 3,
  condSqft: 1200,
  zones: 1,
};

describe("generateFloorplanLayout", () => {
  const rooms: RoomLoad[] = [
    makeRoom({ name: "Living Room", type: "living_room", estimated_sqft: 320, regs: 2 }),
    makeRoom({ name: "Kitchen", type: "kitchen", estimated_sqft: 210, regs: 1 }),
    makeRoom({ name: "Master Bedroom", type: "master_bedroom", estimated_sqft: 250, regs: 2 }),
    makeRoom({ name: "Bedroom 2", type: "bedroom", estimated_sqft: 160, regs: 1 }),
    makeRoom({ name: "Bathroom", type: "bathroom", estimated_sqft: 90, regs: 1, exterior_walls: 0 }),
  ];

  it("produces a layout with all conditioned rooms", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    expect(layout.rooms).toHaveLength(5);
    expect(layout.rooms.map((r) => r.name)).toContain("Living Room");
    expect(layout.rooms.map((r) => r.name)).toContain("Bathroom");
  });

  it("excludes garage and closet rooms", () => {
    const withGarage = [
      ...rooms,
      makeRoom({ name: "Garage", type: "garage", cfm: 0, regs: 0, btu: 0 }),
      makeRoom({ name: "Closet", type: "closet", cfm: 0, regs: 0, btu: 0 }),
    ];
    const layout = generateFloorplanLayout(withGarage, baseSummary);
    expect(layout.rooms).toHaveLength(5);
    expect(layout.rooms.map((r) => r.name)).not.toContain("Garage");
    expect(layout.rooms.map((r) => r.name)).not.toContain("Closet");
  });

  it("places non-overlapping room rectangles", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    for (let i = 0; i < layout.rooms.length; i++) {
      for (let j = i + 1; j < layout.rooms.length; j++) {
        const a = layout.rooms[i];
        const b = layout.rooms[j];
        const overlapsX = a.x < b.x + b.width && a.x + a.width > b.x;
        const overlapsY = a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlapsX && overlapsY).toBe(false);
      }
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

  it("assigns correct register count per room", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    const living = layout.rooms.find((r) => r.name === "Living Room");
    expect(living?.regs).toBe(2);
    expect(living?.registerPositions).toHaveLength(2);

    const kitchen = layout.rooms.find((r) => r.name === "Kitchen");
    expect(kitchen?.regs).toBe(1);
    expect(kitchen?.registerPositions).toHaveLength(1);
  });

  it("marks return grilles on qualifying rooms", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    const living = layout.rooms.find((r) => r.name === "Living Room");
    expect(living?.hasReturn).toBe(true);

    const master = layout.rooms.find((r) => r.name === "Master Bedroom");
    expect(master?.hasReturn).toBe(true);

    // Bathroom: sqft < 200, excluded type — no return
    const bath = layout.rooms.find((r) => r.name === "Bathroom");
    expect(bath?.hasReturn).toBe(false);
  });

  it("generates trunk and branch duct segments", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    const trunks = layout.ducts.filter((d) => d.type === "trunk");
    const branches = layout.ducts.filter((d) => d.type === "branch");

    expect(trunks.length).toBeGreaterThanOrEqual(1);
    // One branch per conditioned room
    expect(branches).toHaveLength(5);
  });

  it("sizes trunk based on tonnage", () => {
    const layout3T = generateFloorplanLayout(rooms, { ...baseSummary, tonnage: 2.5 });
    const trunk3 = layout3T.ducts.find((d) => d.type === "trunk");
    expect(trunk3?.size).toBe('8"×12"');

    const layout4T = generateFloorplanLayout(rooms, { ...baseSummary, tonnage: 3.5 });
    const trunk4 = layout4T.ducts.find((d) => d.type === "trunk");
    expect(trunk4?.size).toBe('10"×14"');

    const layout5T = generateFloorplanLayout(rooms, { ...baseSummary, tonnage: 5 });
    const trunk5 = layout5T.ducts.find((d) => d.type === "trunk");
    expect(trunk5?.size).toBe('12"×16"');
  });

  it("places equipment at top for attic location", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary, {
      suggested_equipment_location: "Attic",
      suggested_zones: 1,
      special_considerations: [],
    });
    expect(layout.equipment.y).toBeLessThan(30);
    expect(layout.equipment.label).toBe("Attic Unit");
  });

  it("handles a single room", () => {
    const layout = generateFloorplanLayout([rooms[0]], baseSummary);
    expect(layout.rooms).toHaveLength(1);
    expect(layout.rooms[0].width).toBeGreaterThan(0);
    expect(layout.rooms[0].height).toBeGreaterThan(0);
  });

  it("returns valid viewBox dimensions", () => {
    const layout = generateFloorplanLayout(rooms, baseSummary);
    expect(layout.viewBox.width).toBe(400);
    expect(layout.viewBox.height).toBe(300);
  });
});
