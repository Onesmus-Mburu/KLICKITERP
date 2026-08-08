/**
 * Mirrors `features/billing/api/query-params.ts`'s `optionalQuery()` helper
 * byte-for-byte (which itself mirrors `features/students/api/query-params.ts`)
 * — the same required-string-query-param codegen quirk shows up on this
 * module's endpoints too (`AcademicCalendarController_listTerms`'s
 * `academicYearId`, `CustomFieldsController_list`'s `entity`,
 * `NumberingController_preview`'s `count`, all declared required `string` in
 * the generated OpenAPI types even though the real handlers treat them as
 * optional/plain `@Query()` params with no `@ApiQuery({required:true})`
 * decorator). Duplicated here rather than imported from `features/billing/`
 * to keep each feature module's `api/` folder self-contained, matching this
 * monorepo's own `features/<module>/{api,hooks,components}` convention.
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
