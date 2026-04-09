import type { GmailMessage } from "@/types/email-connection";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function listMessages(
  accessToken: string,
  query: string,
  maxResults: number = 20
): Promise<Array<{ id: string; threadId: string }>> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const response = await fetch(`${GMAIL_API_BASE}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail list failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
  };
  return data.messages ?? [];
}

export async function getMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const response = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Gmail get failed: ${response.status}`);
  }

  return response.json();
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<string> {
  const response = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Gmail attachment get failed: ${response.status}`);
  }

  const data = (await response.json()) as { data: string; size: number };
  // Normalize URL-safe base64 to standard base64
  return data.data.replace(/-/g, "+").replace(/_/g, "/");
}
