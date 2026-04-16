// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { FloorplanCanvas } from "../floorplan-canvas";
import type { Room } from "@/types/hvac";

// jsdom doesn't implement ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => cleanup());

// jsdom doesn't implement canvas — provide a minimal stub
const mockContext = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  rect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  scale: vi.fn(),
  set fillStyle(_: string) {},
  set strokeStyle(_: string) {},
  set lineWidth(_: number) {},
  set font(_: string) {},
  set textAlign(_: string) {},
  set textBaseline(_: string) {},
};

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as any;
});

// Fixtures
const ROOM_WITH_VERTICES: Room = {
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
  polygon_id: "room_0",
  vertices: [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.1 },
    { x: 0.5, y: 0.5 },
    { x: 0.1, y: 0.5 },
  ],
  bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
  centroid: { x: 0.3, y: 0.3 },
  adjacent_rooms: [],
};

const ROOM_WITHOUT_VERTICES: Room = {
  ...ROOM_WITH_VERTICES,
  name: "Kitchen",
  type: "kitchen",
  polygon_id: "room_1",
  vertices: [],
  bbox: { x: 0.5, y: 0.1, width: 0.3, height: 0.3 },
  centroid: { x: 0.65, y: 0.25 },
};

// Tiny transparent 1x1 PNG
const FAKE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("FloorplanCanvas", () => {
  it("renders SVG overlay with correct element types", () => {
    const { getByLabelText } = render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES, ROOM_WITHOUT_VERTICES]}
        selectedIndex={null}
        onSelectRoom={vi.fn()}
      />,
    );

    const svg = getByLabelText("Floorplan room overlay");

    const polygons = svg.querySelectorAll("polygon");
    const rects = svg.querySelectorAll("rect");

    // ROOM_WITH_VERTICES has 4 vertices → polygon; ROOM_WITHOUT_VERTICES has none → rect
    expect(polygons).toHaveLength(1);
    expect(rects).toHaveLength(1);
  });

  it("calls onSelectRoom with room index when polygon is tapped (no drag)", () => {
    const onSelectRoom = vi.fn();

    const { getByLabelText } = render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES, ROOM_WITHOUT_VERTICES]}
        selectedIndex={null}
        onSelectRoom={onSelectRoom}
      />,
    );

    const svg = getByLabelText("Floorplan room overlay");
    const polygon = svg.querySelector("polygon")!;

    // pointerdown + pointerup at the same position = tap, not drag
    fireEvent.pointerDown(polygon, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 100, clientY: 100 });

    expect(onSelectRoom).toHaveBeenCalledOnce();
    expect(onSelectRoom).toHaveBeenCalledWith(0);
  });

  it("deselects when tapping an already-selected room", () => {
    const onSelectRoom = vi.fn();

    const { getByLabelText } = render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES, ROOM_WITHOUT_VERTICES]}
        selectedIndex={0}
        onSelectRoom={onSelectRoom}
      />,
    );

    const svg = getByLabelText("Floorplan room overlay");
    const polygon = svg.querySelector("polygon")!;

    fireEvent.pointerDown(polygon, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 100, clientY: 100 });

    expect(onSelectRoom).toHaveBeenCalledOnce();
    expect(onSelectRoom).toHaveBeenCalledWith(null);
  });

  it("calls onHoverRoom on pointerEnter and pointerLeave", () => {
    const onHoverRoom = vi.fn();

    const { getByLabelText } = render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES, ROOM_WITHOUT_VERTICES]}
        selectedIndex={null}
        onSelectRoom={vi.fn()}
        onHoverRoom={onHoverRoom}
      />,
    );

    const svg = getByLabelText("Floorplan room overlay");
    const elements = svg.querySelectorAll("polygon, rect");

    // First element is the polygon (room index 0)
    fireEvent.pointerEnter(elements[0]);
    expect(onHoverRoom).toHaveBeenCalledWith(0);

    fireEvent.pointerLeave(elements[0]);
    expect(onHoverRoom).toHaveBeenCalledWith(null);

    // Second element is the rect (room index 1)
    fireEvent.pointerEnter(elements[1]);
    expect(onHoverRoom).toHaveBeenCalledWith(1);

    fireEvent.pointerLeave(elements[1]);
    expect(onHoverRoom).toHaveBeenCalledWith(null);
  });

  it("renders vertex handles on the selected polygon only", () => {
    const { getByLabelText } = render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES, ROOM_WITHOUT_VERTICES]}
        selectedIndex={0}
        onSelectRoom={vi.fn()}
      />,
    );

    const svg = getByLabelText("Floorplan room overlay");
    // 4 vertex groups × 2 circles each (hit + visible) = 8 circles on the selected 4-vertex polygon
    const circles = svg.querySelectorAll("circle");
    expect(circles.length).toBe(8);
  });

  it("does not render vertex handles when no room is selected", () => {
    const { getByLabelText } = render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES, ROOM_WITHOUT_VERTICES]}
        selectedIndex={null}
        onSelectRoom={vi.fn()}
      />,
    );

    const svg = getByLabelText("Floorplan room overlay");
    expect(svg.querySelectorAll("circle").length).toBe(0);
  });

  it("commits vertex drag via onUpdateRoom with scaled dimensions", () => {
    const onUpdateRoom = vi.fn();

    const { container, getByLabelText } = render(
      <FloorplanCanvas
        imageSrc={FAKE_IMAGE}
        rooms={[ROOM_WITH_VERTICES]}
        selectedIndex={0}
        onSelectRoom={vi.fn()}
        onUpdateRoom={onUpdateRoom}
      />,
    );

    // Force a non-zero container rect so pointerToNorm has a valid divisor.
    const wrapper = container.firstElementChild as HTMLElement;
    wrapper.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, toJSON: () => ({}),
    });

    const svg = getByLabelText("Floorplan room overlay");
    const hitCircles = svg.querySelectorAll(".vertex-handle-hit");
    expect(hitCircles.length).toBe(4); // 4 vertex hit-areas

    // Drag the first vertex from (100, 100) → (200, 200) in page coords
    // which maps to (0.1, 0.1) → (0.2, 0.2) in normalized coords.
    fireEvent.pointerDown(hitCircles[0], { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 200, clientY: 200 });

    expect(onUpdateRoom).toHaveBeenCalledOnce();
    const [idx, partial] = onUpdateRoom.mock.calls[0];
    expect(idx).toBe(0);
    expect(partial.vertices[0]).toEqual({ x: 0.2, y: 0.2 });
    // Other vertices unchanged
    expect(partial.vertices[1]).toEqual({ x: 0.5, y: 0.1 });
    // bbox recomputed: vertices are (0.2, 0.2), (0.5, 0.1), (0.5, 0.5), (0.1, 0.5)
    expect(partial.bbox.x).toBeCloseTo(0.1);
    expect(partial.bbox.y).toBeCloseTo(0.1);
    expect(partial.bbox.width).toBeCloseTo(0.4);
    expect(partial.bbox.height).toBeCloseTo(0.4);
    // Dimensions scale proportionally (old bbox was 0.4×0.4, same as new → no change)
    expect(partial.width_ft).toBeCloseTo(15);
    expect(partial.length_ft).toBeCloseTo(20);
  });
});
