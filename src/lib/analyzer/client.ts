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
  if (imageBuffer.length === 0) {
    throw new AnalyzerServiceError("Empty image buffer — upstream decoded empty base64");
  }

  // Copy Buffer bytes into a fresh Uint8Array with a plain ArrayBuffer.
  // (Node Buffer.buffer is ArrayBufferLike, which fetch's BodyInit types reject.)
  const bytes = Uint8Array.from(imageBuffer);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": mediaType, "Content-Length": String(bytes.length) },
      body: bytes,
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
