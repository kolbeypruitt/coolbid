import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { QUOTE_SYSTEM_PROMPT, QUOTE_ANALYSIS_PROMPT } from "@/lib/hvac/quote-prompt";
import { createClient } from "@/lib/supabase/server";
import type { ParsedQuoteResult } from "@/types/catalog";

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

  const { images } = parsed.data;

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
      const label = img.pageNum != null ? `Page ${img.pageNum}` : `Quote page`;
      content.push({
        type: "text",
        text: `[${label}]`,
      });
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

  content.push({ type: "text", text: QUOTE_ANALYSIS_PROMPT });

  let rawText: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: QUOTE_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text block in Claude response");
    }
    rawText = textBlock.text;
  } catch (err) {
    console.error("Claude API error:", err);
    return NextResponse.json(
      { error: "Analysis failed", details: "Claude API call failed" },
      { status: 500 }
    );
  }

  let jsonText = rawText.trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    console.error("No JSON object found in Claude response:", rawText);
    return NextResponse.json(
      { error: "Analysis failed", details: "Response did not contain JSON" },
      { status: 500 }
    );
  }
  jsonText = jsonText.slice(start, end + 1);

  let result: ParsedQuoteResult;
  try {
    result = JSON.parse(jsonText) as ParsedQuoteResult;
  } catch (err) {
    console.error("JSON parse error:", err, "Raw text:", rawText);
    return NextResponse.json(
      { error: "Analysis failed", details: "Could not parse quote result" },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
