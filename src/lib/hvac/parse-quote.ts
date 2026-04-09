import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { QUOTE_SYSTEM_PROMPT, QUOTE_ANALYSIS_PROMPT } from "./quote-prompt";
import type { ParsedQuoteResult } from "@/types/catalog";

export type ParseInput =
  | {
      type: "images";
      images: Array<{
        base64: string;
        mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        pageNum?: number;
      }>;
    }
  | {
      type: "text";
      text: string;
    };

export async function parseQuoteContent(input: ParseInput): Promise<ParsedQuoteResult> {
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  if (input.type === "images") {
    for (const img of input.images) {
      if (input.images.length > 1) {
        content.push({
          type: "text",
          text: `--- Page ${img.pageNum ?? input.images.indexOf(img) + 1} of the quote ---`,
        });
      }
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.base64,
        },
      });
    }
  } else {
    content.push({
      type: "text",
      text: `The following is the body text of a quote email:\n\n${input.text}`,
    });
  }

  content.push({ type: "text", text: QUOTE_ANALYSIS_PROMPT });

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

  let text = textBlock.text.trim();

  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1) {
    text = text.substring(jsonStart, jsonEnd + 1);
  }

  return JSON.parse(text) as ParsedQuoteResult;
}
