import Anthropic from "@anthropic-ai/sdk";

/** Extract the first text block from a Claude response (skipping thinking blocks). */
export function extractTextFromResponse(
  response: Anthropic.Messages.Message
): string {
  const textBlock = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === "text"
  );
  if (!textBlock) throw new Error("No text block in Claude response");
  return textBlock.text;
}

/** Extract JSON from a raw text response that may include markdown fences or surrounding text. */
export function extractJson(rawText: string): string {
  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Response did not contain a JSON object");
  }
  return text.slice(start, end + 1);
}
