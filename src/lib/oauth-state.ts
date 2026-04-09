import { createHmac, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET?.trim();
  if (!secret) throw new Error("OAUTH_STATE_SECRET is not set");
  return secret;
}

export function signOAuthState(payload: { userId: string }): string {
  const data = JSON.stringify({ ...payload, ts: Date.now() });
  const encoded = Buffer.from(data).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(
  state: string
): { valid: true; userId: string } | { valid: false; error: string } {
  const parts = state.split(".");
  if (parts.length !== 2) return { valid: false, error: "Invalid state format" };

  const [encoded, signature] = parts;
  const expected = createHmac("sha256", getSecret()).update(encoded).digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: "Invalid signature" };
  }

  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!data.userId || !data.ts) {
      return { valid: false, error: "Invalid payload" };
    }
    if (Date.now() - data.ts > STATE_TTL_MS) {
      return { valid: false, error: "State expired" };
    }
    return { valid: true, userId: data.userId };
  } catch {
    return { valid: false, error: "Invalid payload" };
  }
}
