/**
 * Mirrors `features/wallet/api/query-params.ts`/`features/departments/api/
 * users-lookup.api.ts`'s own `optionalQuery()` helper byte-for-byte — the
 * same required-vs-actually-optional query-param codegen quirk shows up on
 * `UsersController_list` too (`departmentId`/`status` are still declared as
 * required `string`s in the generated OpenAPI query-param type even though
 * both are genuinely optional server-side — Phase 6 Slice 13 Part 1 only
 * closed this gap for `page`/`pageSize`, via a real `@ApiQuery`, confirmed
 * directly against `packages/contracts/src/generated/openapi-types.ts`'s own
 * `UsersController_list` entry before writing this). Duplicated here rather
 * than imported from another feature's `api/` folder to keep each feature
 * module self-contained, matching this monorepo's own
 * `features/<module>/{api,hooks,components}` convention.
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
