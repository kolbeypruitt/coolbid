export type RoomPolygon = {
  id: string;
  vertices: { x: number; y: number }[];
  bbox: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
  area: number;
  adjacent_to: { room_id: string; shared_edge: string }[];
};

export type GeometryResult = {
  polygons: RoomPolygon[];
  image_width: number;
  image_height: number;
};

export class GeometryServiceError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "GeometryServiceError";
  }
}

export async function extractGeometry(
  imageBuffer: Buffer,
  mediaType: string,
): Promise<GeometryResult> {
  const baseUrl = process.env.GEOMETRY_SERVICE_URL?.trim();
  if (!baseUrl) {
    throw new GeometryServiceError("GEOMETRY_SERVICE_URL environment variable is not set");
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mediaType });
  formData.append("image", blob, `floorplan.${mediaType.split("/")[1] || "jpg"}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/extract-geometry`, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    throw new GeometryServiceError(
      `Floor plan geometry service unavailable: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  if (!response.ok) {
    let detail = "Geometry extraction failed";
    try {
      const body = await response.json();
      detail = body?.detail?.error ?? body?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new GeometryServiceError(detail, response.status);
  }

  return (await response.json()) as GeometryResult;
}
