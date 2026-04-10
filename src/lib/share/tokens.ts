import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically random share token.
 * 32 bytes → 43 base64url characters → 256 bits of entropy.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}
