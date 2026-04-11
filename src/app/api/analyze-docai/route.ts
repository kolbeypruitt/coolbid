import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, SYSTEM_PROMPT, DOCAI_STRUCTURING_PROMPT, GEOMETRY_LABELING_PROMPT, formatPolygonsForPrompt } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import {
  checkAiActionLimit,
  incrementAiActionCount,
} from "@/lib/billing/ai-action-counter";
import { AnalysisResultSchema } from "@/lib/analyze/schema";
import { validateAnalysis } from "@/lib/analyze/validate-analysis";
import { extractJson } from "@/lib/analyze/utils";
import { ocrDocument } from "@/lib/document-ai/client";
import { extractGeometry, GeometryServiceError } from "@/lib/geometry/client";

export const maxDuration = 180;

const BuildingInfoSchema = z
  .object({
    totalSqft: z.number().positive().optional(),
    units: z.number().int().positive().optional(),
    hvacPerUnit: z.boolean().optional(),
  })
  .optional();

function buildConstraints(
  buildingInfo: z.infer<typeof BuildingInfoSchema>
): string {
  if (!buildingInfo) return "";
  const constraints: string[] = [];

  const units = buildingInfo.units ?? 1;
  const perUnit = units > 1 && (buildingInfo.hvacPerUnit ?? false);

  if (buildingInfo.totalSqft != null) {
    const anchorSqft = perUnit
      ? Math.round(buildingInfo.totalSqft / units)
      : buildingInfo.totalSqft;
    constraints.push(
      `The ${perUnit ? "per-unit" : "building total"} conditioned square footage is ${anchorSqft} sqft — use this as your anchor when extracting room sizes.`
    );
  }

  if (units > 1) {
    constraints.push(
      `This is a ${units}-unit building. ${
        perUnit
          ? "Analyze each unit separately. Tag every room with its unit number. Populate unit_sqft with conditioned sqft per unit."
          : "Extract the full building layout."
      }`
    );
  }

  if (constraints.length === 0) return "";
  return `\n\nAdditional constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitCheck = await checkAiActionLimit(supabase, user.id);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error:
          limitCheck.reason === "trial_limit"
            ? "Trial limit reached. Subscribe to continue."
            : "Subscription required.",
        code: limitCheck.reason,
      },
      { status: 402 }
    );
  }

  // Parse FormData
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  let buildingInfo: z.infer<typeof BuildingInfoSchema>;
  try {
    const raw = formData.get("buildingInfo");
    buildingInfo = raw ? BuildingInfoSchema.parse(JSON.parse(raw as string)) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid buildingInfo" }, { status: 400 });
  }

  // Read file into buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = file.type || "application/pdf";

  // Parse optional base64 images for hybrid analysis
  type ImageData = { base64: string; mediaType: string; pageNum?: number };
  let images: ImageData[] = [];
  try {
    const imagesRaw = formData.get("images");
    if (imagesRaw) images = JSON.parse(imagesRaw as string) as ImageData[];
  } catch {
    // Images are optional — continue without them
  }

  // Run Document AI OCR
  const ocrResult = await ocrDocument(buffer, mimeType);
  if (!ocrResult || !ocrResult.text.trim()) {
    // Signal client to fall back to vision-based analysis
    return NextResponse.json({ fallback: true });
  }

  // Run geometry extraction on all page images in parallel
  type PolygonsByFloor = { floor: number; polygons: import("@/lib/geometry/client").RoomPolygon[] };
  let polygonsByFloor: PolygonsByFloor[] = [];

  if (images.length > 0) {
    try {
      polygonsByFloor = await Promise.all(
        images.map(async (img, idx) => {
          const imageBuffer = Buffer.from(img.base64, "base64");
          const geometry = await extractGeometry(imageBuffer, img.mediaType);
          return { floor: img.pageNum ?? idx + 1, polygons: geometry.polygons };
        }),
      );
    } catch (err) {
      if (err instanceof GeometryServiceError) {
        return NextResponse.json(
          { error: err.message, code: "geometry_failed" },
          { status: 422 },
        );
      }
      throw err;
    }
  }

  // Build Claude message: images + OCR text (hybrid approach)
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  // Add images first so Claude can see the floor plan
  for (const img of images) {
    if (img.pageNum != null) {
      content.push({ type: "text", text: `[Page ${img.pageNum}]` });
    }
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.base64,
      },
    });
  }

  // Add OCR text + prompt
  let prompt: string;
  if (polygonsByFloor.length > 0) {
    const polygonText = formatPolygonsForPrompt(polygonsByFloor);
    prompt = GEOMETRY_LABELING_PROMPT + polygonText
      + "\n\n--- OCR TEXT ---\n" + ocrResult.text
      + buildConstraints(buildingInfo);
  } else {
    // OCR-only path (no images provided) — use structuring prompt without geometry
    prompt = DOCAI_STRUCTURING_PROMPT + ocrResult.text + buildConstraints(buildingInfo);
  }
  content.push({ type: "text", text: prompt });

  let rawText: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      thinking: images.length > 0 ? { type: "enabled", budget_tokens: 6000 } : undefined,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );
    if (!textBlock) throw new Error("No text block in Claude response");
    rawText = textBlock.text;
  } catch (err) {
    console.error("Claude API error during Document AI structuring:", err);
    return NextResponse.json({ fallback: true });
  }

  // Parse and validate
  let jsonText: string;
  try {
    jsonText = extractJson(rawText);
  } catch {
    console.error("No JSON in Document AI structuring response:", rawText);
    return NextResponse.json({ fallback: true });
  }

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("JSON parse error:", err);
    return NextResponse.json({ fallback: true });
  }

  const validated = AnalysisResultSchema.safeParse(rawParsed);
  if (!validated.success) {
    console.error("Schema validation failed:", validated.error.flatten());
    return NextResponse.json({ fallback: true });
  }

  const perUnitAnalysis =
    (buildingInfo?.hvacPerUnit ?? false) && (buildingInfo?.units ?? 1) > 1;
  const result = validateAnalysis(validated.data, { perUnitAnalysis });

  if (limitCheck.shouldIncrement) {
    await incrementAiActionCount(supabase, user.id);
  }

  return NextResponse.json(result);
}
