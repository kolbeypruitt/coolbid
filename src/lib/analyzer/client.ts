/** Raw shape of the Modal /analyze response — validated downstream by Zod. */
export type AnalyzerResponse = unknown;

export class AnalyzerServiceError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "AnalyzerServiceError";
  }
}

export async function analyzeFloorPlan(
  imageBuffer: Buffer,
  mediaType: string,
): Promise<AnalyzerResponse> {
  const baseUrl = process.env.ANALYZER_SERVICE_URL?.trim();
  if (!baseUrl) {
    throw new AnalyzerServiceError("ANALYZER_SERVICE_URL environment variable is not set");
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mediaType });
  formData.append("image", blob, `floorplan.${mediaType.split("/")[1] || "jpg"}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    throw new AnalyzerServiceError(
      `Analyzer service unavailable: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  if (!response.ok) {
    let detail = "Analysis failed";
    try {
      const body = await response.json();
      detail = body?.detail?.error ?? body?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new AnalyzerServiceError(detail, response.status);
  }

  return (await response.json()) as AnalyzerResponse;
}
