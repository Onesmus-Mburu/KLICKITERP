import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Envelope encryption helper (AES-256-GCM, app key) per FR-SET-003.1's
 * general pattern — first consumer is `usr_user.twofa_secret_enc` /
 * `recovery_codes_enc`, later reused by the Settings module for
 * `set_integration_config.config_enc`. Ciphertext layout: `iv (12B) ||
 * authTag (16B) || ciphertext`, stored as one `bytea` blob so callers never
 * juggle three columns.
 *
 * `encryptBuffer`/`decryptBuffer` are the binary-native primitives (same
 * layout, no UTF-8 round-trip) — Module 20 (Backups/Ops) is the first
 * consumer needing to encrypt an arbitrary binary tar archive, where
 * `encryptToBuffer`'s `string` plaintext parameter would corrupt non-UTF-8
 * bytes (`cipher.update(plaintext, "utf8")` interprets its input as text).
 * `encryptToBuffer`/`decryptFromBuffer` now delegate to these (behavior-
 * preserving refactor — same IV/auth-tag layout, same output for the same
 * inputs) so the two text-oriented call sites across the codebase (2FA
 * secrets, `set_integration_config.config_enc`, `set_setting.value`,
 * `intg_webhook_subscription.secret_enc`) don't duplicate the AES-GCM logic.
 */
export function encryptBuffer(plaintext: Buffer, keyBase64: string): Buffer {
  const key = decodeKey(keyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBuffer(blob: Buffer, keyBase64: string): Buffer {
  const key = decodeKey(keyBase64);
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptToBuffer(plaintext: string, keyBase64: string): Buffer {
  return encryptBuffer(Buffer.from(plaintext, "utf8"), keyBase64);
}

export function decryptFromBuffer(blob: Buffer, keyBase64: string): string {
  return decryptBuffer(blob, keyBase64).toString("utf8");
}

function decodeKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new RangeError(`APP_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}
