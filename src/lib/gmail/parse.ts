import type {
  GmailMessage,
  GmailMessagePart,
  ExtractedEmailContent,
} from "@/types/email-connection";
import { getAttachment } from "./client";

function findHeader(part: GmailMessagePart, name: string): string | null {
  const header = part.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? null;
}

function walkParts(
  part: GmailMessagePart,
  callback: (part: GmailMessagePart) => void
): void {
  callback(part);
  if (part.parts) {
    for (const subpart of part.parts) {
      walkParts(subpart, callback);
    }
  }
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractEmailContent(
  accessToken: string,
  message: GmailMessage
): Promise<ExtractedEmailContent> {
  const from = findHeader(message.payload, "from") ?? "";
  const subject = findHeader(message.payload, "subject") ?? "";
  const date = findHeader(message.payload, "date") ?? "";

  const attachments: ExtractedEmailContent["attachments"] = [];
  let textBody = "";
  let htmlBody = "";

  const attachmentParts: GmailMessagePart[] = [];
  walkParts(message.payload, (part) => {
    if (part.filename && part.body.attachmentId) {
      if (part.mimeType === "application/pdf") {
        attachmentParts.push(part);
      }
    } else if (part.mimeType === "text/plain" && part.body.data) {
      textBody += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body.data) {
      htmlBody += decodeBase64Url(part.body.data);
    }
  });

  for (const part of attachmentParts) {
    if (!part.body.attachmentId) continue;
    try {
      const base64 = await getAttachment(accessToken, message.id, part.body.attachmentId);
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        base64,
      });
    } catch (err) {
      console.error(`Failed to fetch attachment ${part.filename}:`, err);
    }
  }

  const bodyText = textBody || stripHtml(htmlBody);

  return {
    messageId: message.id,
    from,
    subject,
    date,
    attachments,
    bodyText,
  };
}
