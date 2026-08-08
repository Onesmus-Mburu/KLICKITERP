import { createHash } from "node:crypto";

/**
 * The subset of an audit_log row that feeds the hash chain (FR-AUD-002).
 * Deliberately excludes `id`/`hash` themselves — `id` is a surrogate key
 * with no audit meaning, and `hash` is this function's own output.
 */
export interface AuditHashableEntry {
  actorId: string | null;
  actorLabel: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  at: string;
}

/**
 * Deterministic canonical JSON: object keys sorted, no whitespace, so the
 * same logical entry always serializes identically regardless of property
 * insertion order (a prerequisite for a stable hash chain).
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Computes the hash-chain primitive: SHA-256 over the canonical JSON of
 * `{ prevHash, ...entry }`. Each row's `hash` becomes the next row's
 * `prev_hash`, so any retroactive edit to a historical row breaks every
 * subsequent hash (FR-AUD-002 tamper evidence). Pure function only — the
 * interceptor that calls this on every mutation, and the periodic sweep that
 * verifies the chain against `chain_anchor`, are future work.
 */
export function computeHash(prevHash: string | null, entry: AuditHashableEntry): string {
  const canonical = canonicalize({ prevHash, ...entry });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
