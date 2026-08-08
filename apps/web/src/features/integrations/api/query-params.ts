/**
 * Mirrors `features/billing/api/query-params.ts`'s `optionalQuery()` helper
 * byte-for-byte — duplicated here rather than imported cross-feature to keep
 * each feature module's `api/` folder self-contained, matching this
 * monorepo's own `features/<module>/{api,hooks,components}` convention
 * (`features/wallet/api/query-params.ts` documents the same choice).
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
