/**
 * Phase 6 Slice 3 (Billing core loop) — hand-mirrored response shapes for
 * `AcademicCalendarController`'s `/academic-years` and `/terms` endpoints
 * (`packages/server/src/platform/settings/api/academic-calendar.controller.ts`).
 *
 * Why hand-mirrored instead of pulled from `@klickit/contracts`' generated
 * types: every handler on that controller returns whatever
 * `AcademicCalendarService` gives it back with NO `@ApiResponse({ type })`
 * decorator (confirmed by reading the controller file directly — none of its
 * 11 handlers has one), so `@nestjs/swagger` recorded no response schema at
 * all — confirmed directly in `packages/contracts/src/generated/openapi-types.ts`:
 * `AcademicCalendarController_listYears`/`_listTerms` both have
 * `responses: { 200: { ..., content?: never } }`. This is a real,
 * pre-existing gap in `packages/server`'s Swagger annotations, out of scope
 * to fix from `apps/web` (this slice is frontend-only, per its own plan) —
 * this is the SAME class of gap `types/dashboard.ts` already documents for
 * `DashboardController` (Phase 6 Slice 1), and this file follows that exact
 * precedent rather than inventing a new pattern.
 *
 * Both services return the raw TypeORM entity directly (no DTO/view-mapper —
 * confirmed by reading `academic-calendar.service.ts`'s `listYears()`/
 * `listTerms()`, and confirmed there's no `toView()` helper anywhere in
 * `academic-calendar.controller.ts`), so the real wire shape is the full
 * entity: `packages/server/src/shared/database/base.entity.ts`'s standard
 * columns (`id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`) +
 * `MutableBaseEntity`'s `version`, plus each entity's own fields, read
 * directly from `set-academic-year.entity.ts`/`set-term.entity.ts`. Dates
 * serialize as ISO strings over JSON (`Date` -> `JSON.stringify`), typed as
 * `string` here to match what actually arrives on the wire, not the
 * server-side `Date` type.
 */

export interface AcademicYearResponse {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

export interface TermResponse {
  id: string;
  academicYearId: string;
  name: string;
  seq: number;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  billingLocked: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}
