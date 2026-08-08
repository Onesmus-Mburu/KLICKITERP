/**
 * `StudentsController_list`/`StudentsController_search`'s (and
 * `StreamsController_listByClass`'s) generated OpenAPI query-param types
 * (`packages/contracts/src/generated/openapi-types.ts`) declare EVERY query
 * param as a required `string` — e.g. `StudentsController_list`'s
 * `parameters.query` is `{ classId: string; streamId: string; status: string }`
 * with no `?`. Verified directly against the generated file before writing
 * this: none of these params are actually optional server-side (no
 * `@ApiQuery` decorator on any handler in `students.controller.ts`/
 * `streams.controller.ts` — confirmed by reading them), so the generator had
 * no annotation to infer optionality from and defaulted every query param to
 * required. This is the SAME quirk documented in
 * `apps/web/src/hooks/use-dashboard.ts` (`periodId as string`,
 * `fromPeriodId as string`) but that slice worked around it with scattered
 * `as string` casts at each call site — this slice centralizes the pattern
 * into one helper instead, since Students has many more optional-filter call
 * sites (list filters, search, cascading stream lookup) than dashboard did.
 *
 * `optionalQuery` strips `undefined`/`null`/`""` entries at runtime (so
 * openapi-fetch's querystring builder never emits `?classId=&status=`), then
 * asserts the result back to the "all keys required" shape the generated
 * type demands. The assertion is safe in the way that matters here: a
 * `GET` request with a missing query key is indistinguishable, over HTTP,
 * from one where the generated type didn't require it — the real backend
 * treats every one of these as optional today (confirmed in
 * `students.service.ts`'s `list()`/`search()`), so this is a type-level
 * workaround for a codegen gap, not a masking of a real runtime issue.
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
