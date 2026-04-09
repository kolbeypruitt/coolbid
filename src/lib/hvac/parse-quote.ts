import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { QUOTE_SYSTEM_PROMPT, QUOTE_ANALYSIS_PROMPT } from "./quote-prompt";
import type { ParsedQuoteResult } from "@/types/catalog";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
export type DocumentMediaType = "application/pdf";

export type ParseAttachment = {
  base64: string;
  mediaType: ImageMediaType | DocumentMediaType;
  pageNum?: number;
};

export type ParseInput =
  | { type: "images"; images: ParseAttachment[] }
  | { type: "text"; text: string };

function isImageMediaType(mt: string): mt is ImageMediaType {
  return mt === "image/jpeg" || mt === "image/png" || mt === "image/gif" || mt === "image/webp";
}

export async function parseQuoteContent(input: ParseInput): Promise<ParsedQuoteResult> {
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  if (input.type === "images") {
    for (const att of input.images) {
      if (input.images.length > 1) {
        content.push({
          type: "text",
          text: `--- Page ${att.pageNum ?? input.images.indexOf(att) + 1} of the quote ---`,
        });
      }

      if (isImageMediaType(att.mediaType)) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: att.mediaType,
            data: att.base64,
          },
        });
      } else if (att.mediaType === "application/pdf") {
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: att.base64,
          },
        });
      }
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
