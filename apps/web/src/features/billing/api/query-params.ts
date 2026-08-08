/**
 * Mirrors `features/students/api/query-params.ts`'s `optionalQuery()` helper
 * byte-for-byte — the same required-string-query-param codegen quirk shows
 * up on this module's endpoints too (`AccountsController_list`'s
 * `class`/`isActive`/`parentId`, `AcademicCalendarController_listTerms`'
 * `academicYearId`, `FeeStructuresController_list`'s `termId`/`classId`, all
 * declared required `string` in the generated OpenAPI types even though the
 * real handlers treat them as optional/no `@ApiQuery` decorator exists).
 * Duplicated here rather than imported from `features/students/` to keep
 * each feature module's `api/` folder self-contained, matching this
 * monorepo's own `features/<module>/{api,hooks,components}` convention
 * (Phase 6 Slice 2's own doc comment) — every future module should do the
 * same rather than reach across feature boundaries for a two-function
 * helper.
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
