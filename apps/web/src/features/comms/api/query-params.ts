/**
 * Phase 6 Slice 15 Part 3 — the first file under `features/comms/api/` that
 * needs a query-string builder (Parts 1/2's `listTemplates()`/
 * `listBroadcasts()` take no query params at all; `messages.api.ts`'s new
 * `listMessages()` is the first real caller here). Mirrors
 * `features/payments/api/query-params.ts`'s `optionalQuery()` helper
 * byte-for-byte — the same "strip undefined/null/empty-string keys before
 * handing the object to `apiClient.GET`'s typed `query` param" need applies
 * here too. Duplicated rather than imported from another feature's `api/`
 * folder to keep each feature module's `api/` self-contained, matching this
 * monorepo's own `features/<module>/{api,hooks,components}` convention
 * (Phase 6 Slice 2's own doc comment, restated identically by every other
 * feature's own copy of this file).
 */
export function optionalQuery<T extends Record<string, string | number | boolean | undefined | null>>(
  query: T,
): { [K in keyof T]: Exclude<T[K], undefined | null> } {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result as { [K in keyof T]: Exclude<T[K], undefined | null> };
}
