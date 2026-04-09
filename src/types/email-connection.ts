export type EmailProvider = "gmail";

export type EmailSyncStatus = "idle" | "syncing" | "error";

export type EmailConnection = {
  id: string;
  user_id: string;
  provider: EmailProvider;
  email_address: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  connected_at: string;
  last_sync_at: string | null;
  last_sync_status: EmailSyncStatus;
  last_sync_error: string | null;
  sync_cursor: string | null;
  initial_sync_days: number;
  created_at: string;
  updated_at: string;
};

export type SupplierEmailDomain = {
  id: string;
  user_id: string | null;
  supplier_id: string | null;
  domain: string;
  is_starter: boolean;
  created_at: string;
};

export type GmailMessageHeader = {
  name: string;
  value: string;
};

export type GmailMessagePart = {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailMessageHeader[];
  body: {
    size: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: GmailMessagePart;
  internalDate: string;
};

export type ExtractedEmailContent = {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  attachments: Array<{
    filename: string;
    mimeType: string;
    base64: string;
  }>;
  bodyText: string;
};
