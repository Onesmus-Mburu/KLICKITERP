/**
 * Mirrors `features/billing/api/query-params.ts`'s `optionalQuery()` helper
 * byte-for-byte — the same required-string-query-param codegen quirk shows
 * up here too (`WalletsController_list`'s generated query-param type only
 * declares `q?: string`, dropping `page`/`pageSize`/`sortBy`/`sortDir`
 * entirely, since those come from the un-decorated `@Query() pagination:
 * PaginationQueryDto` object param — confirmed by reading
 * `packages/contracts/src/generated/openapi-types.ts`'s own
 * `WalletsController_list` entry directly). Duplicated here rather than
 * imported from `features/billing/`/`features/students/` to keep each
 * feature module's `api/` folder self-contained, matching this monorepo's
 * own `features/<module>/{api,hooks,components}` convention.
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
