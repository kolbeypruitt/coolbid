import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import {
  anthropic,
  SYSTEM_PROMPT,
  ANALYSIS_PROMPT,
  PASS1_EXTRACTION_PROMPT,
  PASS2_STRUCTURING_PROMPT,
} from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import {
  checkAiActionLimit,
  incrementAiActionCount,
} from "@/lib/billing/ai-action-counter";
import { AnalysisResultSchema } from "@/lib/analyze/schema";
import { validateAnalysis } from "@/lib/analyze/validate-analysis";

export const maxDuration = 120;

const ImageSchema = z.object({
  base64: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  pageNum: z.number().int().positive().optional(),
});

const RequestSchema = z.object({
  images: z.array(ImageSchema).min(1),
  buildingInfo: z
    .object({
      totalSqft: z.number().positive().optional(),
      units: z.number().int().positive().optional(),
      hvacPerUnit: z.boolean().optional(),
    })
    .optional(),
});

function buildImageContent(
  images: z.infer<typeof RequestSchema>["images"]
): Anthropic.Messages.ContentBlockParam[] {
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (images.length === 1) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: images[0].mediaType,
        data: images[0].base64,
      },
    });
  } else {
    for (const img of images) {
      const label =
        img.pageNum != null ? `Page ${img.pageNum}` : `Floor plan`;
      content.push({ type: "text", text: `[${label}]` });
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.base64,
        },
      });
    }
  }
  return content;
}

function buildConstraints(
  buildingInfo: z.infer<typeof RequestSchema>["buildingInfo"]
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
          ? "Analyze one unit only. The sqft anchor above reflects one unit."
          : "Extract the full building layout."
      }`
    );
  }

  if (constraints.length === 0) return "";
  return `\n\nAdditional constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}`;
}

/** Extract the first text block from a Claude response (skipping thinking blocks). */
function extractTextFromResponse(
  response: Anthropic.Messages.Message
): string {
  const textBlock = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === "text"
  );
  if (!textBlock) throw new Error("No text block in Claude response");
  return textBlock.text;
}

/** Extract JSON from a raw text response that may include markdown fences or surrounding text. */
function extractJson(rawText: string): string {
  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Response did not contain a JSON object");
  }
  return text.slice(start, end + 1);
}

function shouldUseTwoPass(
  imageCount: number,
  totalSqft: number | undefined
): boolean {
  return imageCount > 2 || (totalSqft != null && totalSqft > 2500);
}

/* ── Single-pass analysis (with extended thinking) ──────────────────── */

async function singlePassAnalysis(
  imageContent: Anthropic.Messages.ContentBlockParam[],
  buildingInfo: z.infer<typeof RequestSchema>["buildingInfo"]
): Promise<string> {
  const userPrompt = ANALYSIS_PROMPT + buildConstraints(buildingInfo);
  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...imageContent,
    { type: "text", text: userPrompt },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  return extractTextFromResponse(response);
}

/* ── Two-pass analysis (perception then structuring) ────────────────── */

async function twoPassAnalysis(
  imageContent: Anthropic.Messages.ContentBlockParam[],
  buildingInfo: z.infer<typeof RequestSchema>["buildingInfo"]
): Promise<string> {
  // Pass 1: Raw annotation extraction (vision + extended thinking)
  const pass1Content: Anthropic.Messages.ContentBlockParam[] = [
    ...imageContent,
    { type: "text", text: PASS1_EXTRACTION_PROMPT + buildConstraints(buildingInfo) },
  ];

  const pass1Response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    thinking: { type: "enabled", budget_tokens: 10000 },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: pass1Content }],
  });

  const rawExtraction = extractTextFromResponse(pass1Response);

  // Pass 2: Structure the extraction into JSON (text-only, no images)
  const pass2Response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    system: "You are an expert HVAC engineer structuring floor plan data into JSON for load calculations.",
    messages: [
      {
        role: "user",
        content: PASS2_STRUCTURING_PROMPT + rawExtraction,
      },
    ],
  });

  return extractTextFromResponse(pass2Response);
}

/* ── Route handler ──────────────────────────────────────────────────── */

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { images, buildingInfo } = parsed.data;
  const imageContent = buildImageContent(images);

  // Analyze: two-pass for complex plans, single-pass otherwise
  let rawText: string;
  try {
    if (shouldUseTwoPass(images.length, buildingInfo?.totalSqft)) {
      rawText = await twoPassAnalysis(imageContent, buildingInfo);
    } else {
      rawText = await singlePassAnalysis(imageContent, buildingInfo);
    }
  } catch (err) {
    console.error("Claude API error:", err);
    return NextResponse.json(
      { error: "Analysis failed", details: "Claude API call failed" },
      { status: 500 }
    );
  }

  // Parse JSON from response
  let jsonText: string;
  try {
    jsonText = extractJson(rawText);
  } catch {
    console.error("No JSON object found in Claude response:", rawText);
    return NextResponse.json(
      { error: "Analysis failed", details: "Response did not contain JSON" },
      { status: 500 }
    );
  }

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("JSON parse error:", err, "Raw text:", rawText);
    return NextResponse.json(
      { error: "Analysis failed", details: "Could not parse analysis result" },
      { status: 500 }
    );
  }

  // Validate with Zod schema (coerces types, applies defaults, normalizes room types)
  const validated = AnalysisResultSchema.safeParse(rawParsed);
  if (!validated.success) {
    console.error("Schema validation failed:", validated.error.flatten());
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: "Response did not match expected structure",
        validation: validated.error.flatten(),
      },
      { status: 500 }
    );
  }

  // Post-processing: fix sqft inconsistencies, flag anomalies, apply defaults
  const perUnitAnalysis =
    (buildingInfo?.hvacPerUnit ?? false) && (buildingInfo?.units ?? 1) > 1;
  const result = validateAnalysis(validated.data, { perUnitAnalysis });

  if (limitCheck.shouldIncrement) {
    await incrementAiActionCount(supabase, user.id);
  }

  return NextResponse.json(result);
}
