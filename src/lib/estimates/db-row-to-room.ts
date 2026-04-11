import type { Room, RoomType } from "@/types/hvac";

/**
 * Convert a Supabase estimate_rooms row to the Room type.
 * Handles both old rows (no spatial data) and new rows (with geometry fields).
 */
export function dbRowToRoom(
  r: Record<string, unknown>,
  index: number,
): Room {
  return {
    name: r.name as string,
    type: (r.type as string) as RoomType,
    floor: (r.floor as number) ?? 1,
    estimated_sqft: (r.sqft as number) ?? 0,
    width_ft: (r.width_ft as number) ?? 0,
    length_ft: (r.length_ft as number) ?? 0,
    window_count: (r.window_count as number) ?? 0,
    exterior_walls: (r.exterior_walls as number) ?? 0,
    ceiling_height: (r.ceiling_height as number) ?? 8,
    notes: (r.notes as string) ?? "",
    conditioned: r.conditioned != null
      ? Boolean(r.conditioned)
      : ((r.type as string) !== "garage"),
    polygon_id: (r.polygon_id as string) ?? `room_${index}`,
    bbox: {
      x: (r.bbox_x as number) ?? 0,
      y: (r.bbox_y as number) ?? 0,
      width: (r.bbox_width as number) ?? 1,
      height: (r.bbox_height as number) ?? 1,
    },
    centroid: {
      x: (r.centroid_x as number) ?? 0.5,
      y: (r.centroid_y as number) ?? 0.5,
    },
    adjacent_rooms: (r.adjacent_rooms as string[]) ?? [],
  };
}
