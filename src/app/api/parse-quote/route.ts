import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiActionLimit, incrementAiActionCount } from "@/lib/billing/ai-action-counter";
import { parseQuoteContent } from "@/lib/hvac/parse-quote";

const ImageSchema = z.object({
  base64: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  pageNum: z.number().int().positive().optional(),
});

const RequestSchema = z.object({
  images: z.array(ImageSchema).min(1),
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

  try {
    const result = await parseQuoteContent({
      type: "images",
      images: parsed.data.images,
    });

    if (limitCheck.shouldIncrement) {
      await incrementAiActionCount(supabase, user.id);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Quote parsing failed:", error);
    return NextResponse.json(
      { error: "Failed to parse quote" },
      { status: 500 }
    );
  }
}
