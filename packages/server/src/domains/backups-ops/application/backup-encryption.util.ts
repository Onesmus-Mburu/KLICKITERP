import { createHash } from "node:crypto";
import { decryptBuffer, encryptBuffer } from "../../../shared/crypto/aes-gcm.util";

/**
 * `BACKUP_PASSPHRASE` is an arbitrary-length human passphrase, but
 * `shared/crypto/aes-gcm.util.ts`'s AES-256-GCM primitives require an exact
 * 32-byte key. SHA-256 of the passphrase is the deliberately simple KDF
 * here — deterministic, dependency-free, reuses Node's built-in `crypto`
 * (no new npm dependency for something like scrypt/PBKDF2 passphrase
 * stretching). A production-grade design might prefer a stretching KDF to
 * slow down offline brute-force of a weak passphrase; that refinement is
 * out of this pass's scope (schools are told to treat `BACKUP_PASSPHRASE`
 * as a real secret regardless, same as `APP_ENCRYPTION_KEY`) and is a
 * documented, revisitable judgement call, not an oversight.
 */
export function deriveBackupKeyBase64(passphrase: string): string {
  return createHash("sha256").update(passphrase, "utf8").digest("base64");
}

/**
 * FR-BKP-001.1's "key-check block" — a small AES-256-GCM-encrypted known
 * plaintext stored in `bkp_backup_run.manifest.passphraseCheck`. Restoring
 * with the WRONG `BACKUP_PASSPHRASE` fails the GCM auth-tag check
 * immediately on this tiny block, giving a fast, clear
 * "passphrase doesn't match" error BEFORE attempting to decrypt the full
 * (potentially large) archive — much friendlier than an opaque auth-tag
 * failure mid-way through decrypting gigabytes of tar data.
 */
export const BACKUP_PASSPHRASE_CHECK_PLAINTEXT = "KLICKIT-BACKUP-PASSPHRASE-CHECK-V1";

export function buildPassphraseCheck(keyBase64: string): string {
  return encryptBuffer(Buffer.from(BACKUP_PASSPHRASE_CHECK_PLAINTEXT, "utf8"), keyBase64).toString("base64");
}

/** Returns `false` (never throws) on any decrypt failure — a wrong passphrase, corrupted `passphraseCheck`, or any other AES-GCM auth-tag mismatch are all just "doesn't match" to the caller. */
export function passphraseMatches(passphraseCheck: string, keyBase64: string): boolean {
  try {
    const decrypted = decryptBuffer(Buffer.from(passphraseCheck, "base64"), keyBase64).toString("utf8");
    return decrypted === BACKUP_PASSPHRASE_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}
