import { Injectable } from "@nestjs/common";
import { MaterializedViewsRepository, ReportingMaterializedViewName } from "../infrastructure/materialized-views.repository";

/**
 * Thin application-layer entry point over the foundation pass's
 * `MaterializedViewsRepository.refresh()`/`.refreshAll()` — kept as a
 * separate service (rather than having `dashboard.controller.ts` inject the
 * infrastructure repository directly) purely for layering consistency with
 * every other controller in this codebase, which talks to `application/`
 * services, never `infrastructure/` repositories, directly.
 *
 * **No `em?: EntityManager` parameter, a deliberate deviation from this
 * module's usual write-side service signature convention** —
 * `MaterializedViewsRepository`'s own class doc comment is explicit that
 * `REFRESH MATERIALIZED VIEW CONCURRENTLY` "must run OUTSIDE any ambient
 * transaction... it errors if invoked inside `BEGIN`/`COMMIT`." Accepting an
 * `EntityManager` here would invite a caller to run this inside their own
 * open transaction, which fails at the DB layer — so this service
 * intentionally exposes no such parameter.
 *
 * **Manually-callable only — no automatic refresh cadence.** The MV
 * table's own documented cadences (60s/60s/5min/hourly/5min,
 * `docs/phase-4/02-schema-platform-accounting.md` §8) need a real
 * scheduler/worker process, which does not exist anywhere in this codebase
 * (same honest "on-demand works, automatic cadence is deferred" gap as
 * `RecurringService.runDue()`/`ReportSchedulesService.runDue()` in this same
 * module, and Communications' `comm_trigger_binding` dispatcher). Until a
 * scheduler exists, `refreshAll()`/`refreshOne()` are exposed as a manual
 * `POST /dashboard/refresh-mvs` endpoint a school admin (or an external
 * cron/systemd-timer hitting that endpoint) can call on demand.
 */
@Injectable()
export class MvRefreshService {
  constructor(private readonly mvRepository: MaterializedViewsRepository) {}

  async refreshAll(): Promise<void> {
    return this.mvRepository.refreshAll();
  }

  async refreshOne(viewName: ReportingMaterializedViewName): Promise<void> {
    return this.mvRepository.refresh(viewName);
  }
}
