/**
 * Phase 6 Slice 11 Part 1 — `set_custom_field_def.options` is genuinely
 * unvalidated `jsonb`, server-side (confirmed by reading
 * `set-custom-field-def.entity.ts`/`create-custom-field.dto.ts` directly:
 * `options?: unknown`, no shape enforced anywhere) — this is the FIRST
 * frontend UI to ever write into it, so there is no existing shape
 * convention to match. Since the plan's own guidance is "likely only
 * meaningful for SELECT," this app deliberately commits to ONE simple,
 * real shape for that case — a flat array of choice-label strings, e.g.
 * `["Male", "Female"]` — edited in the form as a comma-separated list
 * rather than a raw JSON textarea (friendlier for the realistic case: a
 * short list of SELECT choices, not arbitrary nested JSON). A future
 * consumer of a SELECT custom field (e.g. a Students-module custom-field
 * input renderer) can rely on this shape for anything created through this
 * UI; a field def created some other way (direct DB/API) with a different
 * `options` shape still round-trips safely here (see `optionsToText`'s
 * JSON-stringify fallback below) — this helper never crashes on an
 * unexpected shape, it just can't offer the friendly comma-list editing
 * experience for it.
 */
export function optionsToText(options: unknown): string {
  if (options === null || options === undefined) return "";
  if (Array.isArray(options) && options.every((entry) => typeof entry === "string")) {
    return (options as string[]).join(", ");
  }
  try {
    return JSON.stringify(options);
  } catch {
    return "";
  }
}

/** Inverse of `optionsToText` — empty input means "no options" (`undefined`, omitted from the request body entirely, never sent as `null`/`[]`). Always produces the flat string-array shape this app's own forms commit to, even if the original value (round-tripped through `optionsToText`'s JSON fallback) was something else — editing a non-array `options` value through this UI intentionally normalizes it to the array shape on save. */
export function textToOptions(text: string): string[] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}
