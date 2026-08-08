import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { LicenseDeactivatedException, LicenseSuspendedException } from "../exceptions/license-suspended.exception";
import { IS_EXEMPT_FROM_LICENSE_GUARD_METADATA_KEY } from "./exempt-from-license-guard.decorator";

interface MinimalHttpRequest {
  method: string;
}

interface CachedState {
  state: string | null;
  fetchedAtMs: number;
}

const STATE_CACHE_TTL_MS = 5_000;

/**
 * States FR-LIC-006.1 names explicitly are `SUSPENDED` (blocks mutations)
 * and `DEACTIVATED` (blocks almost everything, handled separately below).
 * `EXPIRED` is not named in FR-LIC-006.1's enforcement rule at all — this
 * guard treats it as at-least-as-restrictive as `SUSPENDED` (mutations
 * blocked, reads/exports/backups still allowed), a documented judgement
 * call: docs/phase-4/04-schema-operations.md §7's CHECK enum lists it as a
 * distinct terminal-ish state but no FR/BR spells out what it should do at
 * the guard layer, and "block writes, not reads" is the safer default for
 * an unspecified terminal state than "allow everything."
 */
const MUTATION_BLOCKING_STATES = new Set(["SUSPENDED", "EXPIRED"]);

/**
 * Third position in the documented `Jwt -> License -> Permissions ->
 * Authority` pipeline (docs/phase-3/01-system-architecture.md, restated in
 * `platform/auth/auth.module.ts`'s own doc comment) — Module 1 explicitly
 * left this guard unbuilt ("LicenseGuard omitted from the guard pipeline
 * for now, licensing is module 21"); this is that gap closing.
 *
 * Lives in `shared/rbac` (NOT `licensing/`) because `licensing` may be
 * imported by nothing (module-deps.json `"importableBy": []`) — this guard
 * is wired into `platform/auth`'s `APP_GUARD` list, which would violate that
 * isolation if the guard class lived inside the licensing module itself.
 * Instead it reads license state via `license.v_state` — a narrow read-only
 * view `kfe_app` is granted `SELECT` on (migration `0190`,
 * `CreateLicenseTablesAndViews0190`), the exact mirror-image of
 * `license.v_usage_stats` (granted to `kfe_license` for the opposite
 * direction) — see that migration's own doc comment for the full write-up
 * of this symmetric-view isolation mechanism. Raw `DataSource.query()`,
 * never a TypeORM entity/repository import crossing the boundary.
 *
 * Per-request DB round trips are avoided via a short (5s) process-local
 * cache — license state changes at most a few times a year in practice, so
 * a few seconds of staleness is an acceptable trade against querying
 * `license.v_state` on every single request in the app.
 */
@Injectable()
export class LicenseStateGuard implements CanActivate {
  private static cached: CachedState | null = null;
  private readonly logger = new Logger(LicenseStateGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isExempt = this.reflector.getAllAndOverride<boolean | undefined>(IS_EXEMPT_FROM_LICENSE_GUARD_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isExempt) {
      return true;
    }

    const state = await this.readState();
    if (state === null) {
      // No license row provisioned yet (fresh install, pre-registration) or
      // license.v_state unreachable — fail open. BR-LIC-01's enforcement is
      // only ever a restriction (SUSPENDED/DEACTIVATED); with no evidence of
      // either, the safe default is to let the request through rather than
      // lock the whole app out over infrastructure that hasn't run yet.
      return true;
    }

    const request = context.switchToHttp().getRequest<MinimalHttpRequest>();

    if (state === "DEACTIVATED") {
      // FR-LIC-006.1: "login restricted to System Admin with export/backup
      // screens only." Auth/export/backup endpoints already opt out via
      // `@ExemptFromLicenseGuard()` at their own controllers (checked
      // above), so every OTHER non-exempt endpoint is blocked outright here,
      // regardless of HTTP method. The finer-grained "restricted to System
      // Admin" check on WHO may complete login while DEACTIVATED is NOT
      // implemented in this pass — it would require `AuthService.login()`
      // itself to branch on license state and the caller's role, which is
      // outside this guard's "add a decorator to route handlers" scope.
      // Honestly documented gap — see docs/phase-5/PROGRESS.md's Module 21 row.
      throw new LicenseDeactivatedException({ state });
    }

    if (MUTATION_BLOCKING_STATES.has(state) && request.method !== "GET") {
      throw new LicenseSuspendedException({ state, method: request.method });
    }

    return true;
  }

  private async readState(): Promise<string | null> {
    const cached = LicenseStateGuard.cached;
    if (cached && Date.now() - cached.fetchedAtMs < STATE_CACHE_TTL_MS) {
      return cached.state;
    }

    try {
      const rows: Array<{ state: string }> = await this.dataSource.query("SELECT state FROM license.v_state");
      const state = rows[0]?.state ?? null;
      LicenseStateGuard.cached = { state, fetchedAtMs: Date.now() };
      return state;
    } catch (error) {
      this.logger.warn(`Could not read license.v_state — failing open: ${(error as Error).message}`);
      return null;
    }
  }

  /** Test-only escape hatch — the process-local cache is a `static` so it survives across guard instances; tests need to reset it between cases. */
  static resetCacheForTests(): void {
    LicenseStateGuard.cached = null;
  }
}
