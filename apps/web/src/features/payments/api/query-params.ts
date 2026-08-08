/**
 * Mirrors `features/students/api/query-params.ts`'s `optionalQuery()` helper
 * byte-for-byte — the same required-string-query-param codegen quirk shows
 * up on this module's endpoints too (`AccountsController_list__banking`'s
 * `kind`/`isActive`, declared required `string` in the generated OpenAPI
 * types even though the real handler treats them as optional/no `@ApiQuery`
 * decorator exists). Duplicated here rather than imported from
 * `features/students/`/`features/billing/` to keep each feature module's
 * `api/` folder self-contained, matching this monorepo's own
 * `features/<module>/{api,hooks,components}` convention (Phase 6 Slice 2's
 * own doc comment, restated identically by Slice 3's own copy of this file).
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
