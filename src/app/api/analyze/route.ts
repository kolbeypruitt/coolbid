import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  checkAiActionLimit,
  incrementAiActionCount,
} from "@/lib/billing/ai-action-counter";
import { AnalysisResultSchema } from "@/lib/analyze/schema";
import { validateAnalysis } from "@/lib/analyze/validate-analysis";
import { analyzeFloorPlan, AnalyzerServiceError } from "@/lib/analyzer/client";

export const maxDuration = 180;

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

  // Analyze each page in parallel, then merge rooms (tagging each room with its floor).
  let perFloor: Array<{ floor: number; raw: unknown }>;
  try {
    perFloor = await Promise.all(
      images.map(async (img, idx) => {
        const buffer = Buffer.from(img.base64, "base64");
        const raw = await analyzeFloorPlan(buffer, img.mediaType);
        return { floor: img.pageNum ?? idx + 1, raw };
      })
    );
  } catch (err) {
    console.error("analyzer service error:", err);
    if (err instanceof AnalyzerServiceError) {
      return NextResponse.json(
        { error: err.message, code: "analyzer_failed" },
        { status: err.statusCode ?? 502 }
      );
    }
    return NextResponse.json(
      { error: "Analysis failed", details: "Analyzer service error" },
      { status: 500 }
    );
  }

  // Merge per-floor analyses into a single AnalysisResult shape.
  const merged = mergeFloors(perFloor);

  // Validate with Zod schema (coerces types, normalizes room types, applies defaults).
  const validated = AnalysisResultSchema.safeParse(merged);
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

  const perUnitAnalysis =
    (buildingInfo?.hvacPerUnit ?? false) && (buildingInfo?.units ?? 1) > 1;
  const result = validateAnalysis(validated.data, { perUnitAnalysis });

  if (limitCheck.shouldIncrement) {
    await incrementAiActionCount(supabase, user.id);
  }

  return NextResponse.json(result);
}

/** Combine per-page analyses into one AnalysisResult, stamping each room with its floor. */
function mergeFloors(perFloor: Array<{ floor: number; raw: unknown }>): unknown {
  if (perFloor.length === 1) {
    const { floor, raw } = perFloor[0];
    if (raw && typeof raw === "object" && "rooms" in raw) {
      const r = raw as { rooms?: Array<Record<string, unknown>> };
      r.rooms = (r.rooms ?? []).map((room) => ({ ...room, floor }));
    }
    return raw;
  }

  const first = perFloor[0].raw as Record<string, unknown>;
  const allRooms: Array<Record<string, unknown>> = [];
  let totalSqft = 0;
  let stories = 0;

  for (const { floor, raw } of perFloor) {
    const r = raw as Record<string, unknown>;
    const rooms = (r.rooms as Array<Record<string, unknown>>) ?? [];
    for (const room of rooms) {
      allRooms.push({
        ...room,
        floor,
        polygon_id: `floor${floor}_${room.polygon_id ?? `room_${allRooms.length}`}`,
      });
    }
    const building = r.building as Record<string, unknown> | undefined;
    const sqft = typeof building?.total_sqft === "number" ? building.total_sqft : 0;
    totalSqft += sqft;
    stories = Math.max(stories, floor);
  }

  return {
    ...first,
    building: {
      ...(first.building as Record<string, unknown>),
      stories: Math.max(stories, 1),
      total_sqft: totalSqft || (first.building as { total_sqft?: number })?.total_sqft || 0,
    },
    rooms: allRooms,
  };
}
