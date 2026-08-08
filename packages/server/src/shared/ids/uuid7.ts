import { randomBytes } from "node:crypto";

const HEX_GROUPS = [
  [0, 8],
  [8, 12],
  [12, 16],
  [16, 20],
  [20, 32],
] as const;

/**
 * Generates a UUIDv7 (RFC 9562): 48-bit big-endian unix millisecond timestamp,
 * 4-bit version, 12 bits of randomness, 2-bit variant, 62 bits of randomness.
 * Time-ordered so it can serve as a UUID primary key without destroying index
 * locality (docs/phase-4/01-standards-and-migrations.md §2 "Primary key" rule).
 */
export function generateUuidV7(): string {
  const bytes = Buffer.alloc(16);
  const unixTsMs = BigInt(Date.now());

  bytes[0] = Number((unixTsMs >> 40n) & 0xffn);
  bytes[1] = Number((unixTsMs >> 32n) & 0xffn);
  bytes[2] = Number((unixTsMs >> 24n) & 0xffn);
  bytes[3] = Number((unixTsMs >> 16n) & 0xffn);
  bytes[4] = Number((unixTsMs >> 8n) & 0xffn);
  bytes[5] = Number(unixTsMs & 0xffn);

  const rand = randomBytes(10);

  bytes[6] = 0x70 | (rand[0] & 0x0f);
  bytes[7] = rand[1];

  bytes[8] = 0x80 | (rand[2] & 0x3f);
  bytes[9] = rand[3];
  bytes[10] = rand[4];
  bytes[11] = rand[5];
  bytes[12] = rand[6];
  bytes[13] = rand[7];
  bytes[14] = rand[8];
  bytes[15] = rand[9];

  const hex = bytes.toString("hex");
  return HEX_GROUPS.map(([start, end]) => hex.slice(start, end)).join("-");
}

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}
