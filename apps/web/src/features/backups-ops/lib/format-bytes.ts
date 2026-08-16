/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — no `formatBytes` utility
 * exists anywhere in `lib/` (confirmed by grep before writing this), unlike
 * `lib/money.ts`'s own `formatMoney()` for currency. `sizeBytes` on
 * `BackupRunResponseDto` arrives as a STRING (64-bit-safe, JS `number` can't
 * hold the full range) — accepts `string | number | null | undefined`
 * directly so every call site can pass the raw API field with no
 * pre-conversion.
 */
const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < UNITS.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${UNITS[unitIndex]}`;
}
