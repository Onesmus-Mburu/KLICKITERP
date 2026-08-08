import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { ValidationException } from "../../../shared/exceptions/validation.exception";

/** FR-LIC-001.1's license file payload shape — JSON, Ed25519-signed by Infoney. */
export interface LicenseFilePayload {
  school_id: string;
  plan: string;
  features: string[];
  valid_from: string;
  valid_to: string;
  grace_days: number;
}

interface LicenseFileEnvelope {
  payload: LicenseFilePayload;
  signature: string;
}

/**
 * Deterministic JSON serialization (object keys sorted recursively) — the
 * exact bytes both the signer (Infoney, out-of-band) and this verifier must
 * agree on. Exported so `signLicensePayload` below (test fixtures) and
 * `verifyLicenseBlob` never drift apart.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJsonStringify(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * FR-LIC-001.1 — verifies a license file's Ed25519 signature against a
 * baked-in Infoney public key (`AppConfigService.infoneyLicensePublicKeyCurrent`/
 * `.infoneyLicensePublicKeyPrevious`, resolved by the caller — this function
 * itself is pure, taking a PEM string directly, so it's trivially unit
 * testable against a locally generated keypair with no DI). The license
 * file is a small JSON envelope, `{payload, signature}` — `signature` is a
 * base64-encoded Ed25519 signature over `canonicalJsonStringify(payload)`.
 * Real signature verification via Node's `crypto.verify`/`crypto.createPublicKey`
 * with `algorithm=null` (Ed25519's one-shot API — the algorithm parameter
 * is only meaningful for hash-then-sign schemes; Ed25519 has its own
 * built-in hashing, so Node requires `null` here, not a digest name).
 *
 * Throws `ValidationException` on ANY failure (malformed envelope, bad
 * signature) — deliberately the same exception/message shape for both
 * failure modes rather than distinguishing "malformed JSON" from "bad
 * signature" in the message a caller ultimately sees, so this never becomes
 * a signature-forging oracle; the specific reason still travels in `details`
 * for server-side logs.
 */
export function verifyLicenseBlob(blobText: string, publicKeyPem: string): LicenseFilePayload {
  let envelope: LicenseFileEnvelope;
  try {
    envelope = JSON.parse(blobText) as LicenseFileEnvelope;
  } catch (error) {
    throw new ValidationException("Invalid license file", { reason: `not valid JSON: ${(error as Error).message}` });
  }
  if (!envelope || typeof envelope !== "object" || !envelope.payload || typeof envelope.signature !== "string") {
    throw new ValidationException("Invalid license file", { reason: "missing payload/signature" });
  }

  let isValid: boolean;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const message = Buffer.from(canonicalJsonStringify(envelope.payload), "utf8");
    const signature = Buffer.from(envelope.signature, "base64");
    isValid = cryptoVerify(null, message, publicKey, signature);
  } catch (error) {
    throw new ValidationException("Invalid license file", { reason: `signature check errored: ${(error as Error).message}` });
  }

  if (!isValid) {
    throw new ValidationException("Invalid license file", { reason: "signature verification failed" });
  }

  return envelope.payload;
}

/**
 * Signs a license payload with an Ed25519 private key, producing the exact
 * envelope `verifyLicenseBlob` accepts. In production this happens entirely
 * on Infoney's side, out of band — this codebase never holds a real Infoney
 * private key and never calls this function outside tests. Exists here
 * (rather than duplicated inline in every spec file) purely so
 * `canonicalJsonStringify` can't drift between a test's signing step and
 * this module's own verifying step.
 */
export function signLicensePayload(payload: LicenseFilePayload, privateKeyPem: string): string {
  const privateKey = createPrivateKey(privateKeyPem);
  const message = Buffer.from(canonicalJsonStringify(payload), "utf8");
  const signature = cryptoSign(null, message, privateKey);
  const envelope: LicenseFileEnvelope = { payload, signature: signature.toString("base64") };
  return JSON.stringify(envelope);
}
