import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Redis } from "ioredis";
import { DataSource } from "typeorm";
import { REDIS_CLIENT, Public, ExemptFromLicenseGuard } from "@klickit/server";

/**
 * Bare liveness/readiness probes for a load balancer/orchestrator
 * (docs/phase-3/01-system-architecture.md §5's "Health: `/health` (liveness)
 * + `/health/ready` (DB/Redis/MinIO probes)"). Deliberately separate from
 * `domains/backups-ops`'s existing `GET /ops/health`
 * (`OpsHealthService`/`OpsController`) — that one is the detailed,
 * permission-gated admin ops summary meant for a human operator inside the
 * authenticated app; this one is meant for infrastructure (Docker
 * healthcheck, Nginx upstream check, k8s probe) that holds no JWT and must
 * never be asked for one. Both `@Public()` (opts out of
 * `JwtAuthGuard`/`PermissionsGuard`/`AuthorityGuard`) and
 * `@ExemptFromLicenseGuard()` (opts out of `LicenseStateGuard`) are applied
 * — a health check must never require auth or a valid license, per this
 * controller's own task brief and the same precedent `platform/auth`'s own
 * login/refresh/logout endpoints already established.
 *
 * `@ApiExcludeController()` keeps these two bare probe routes out of the
 * `/api/docs` Swagger document — they carry no bearer-auth requirement and
 * would be a confusing outlier next to the rest of the documented surface,
 * which is exactly the kind of route Swagger's own exclude mechanism exists
 * for.
 *
 * Registered OUTSIDE the `/api/v1` global prefix (`main.api.ts`'s
 * `setGlobalPrefix(..., { exclude: [...] })`) — a load balancer/orchestrator
 * expects bare `/health`, not `/api/v1/health`.
 */
@ApiExcludeController()
@Controller("health")
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Liveness — the process is up and able to handle a request. No dependency checks: a DB/Redis blip must never flip a load balancer's liveness verdict and trigger a restart loop. */
  @Get()
  @Public()
  @ExemptFromLicenseGuard()
  liveness(): { status: "ok"; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  /**
   * Readiness — real dependency probes. MinIO is deliberately NOT checked:
   * it is not part of this dev environment's `docker-compose.dev.yml` (only
   * postgres+redis — see `.env.example`'s own "Storage" group comment and
   * `AppConfigService.minioEndpoint`'s doc comment for the same documented
   * gap), so hard-failing readiness on its absence would make every
   * deployment that hasn't yet stood up MinIO permanently "not ready" for a
   * dependency this pass never had the means to bring up. MinIO's presence
   * is reported as `"skipped"` (best-effort) rather than silently omitted,
   * so the gap stays visible in the response body without failing the
   * overall readiness verdict.
   */
  @Get("ready")
  @Public()
  @ExemptFromLicenseGuard()
  async readiness(): Promise<{
    status: "ok" | "degraded";
    checks: { database: CheckResult; redis: CheckResult; minio: CheckResult };
  }> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const minio: CheckResult = { status: "skipped", detail: "MinIO not provisioned in this environment" };

    const overall: "ok" | "degraded" = database.status === "ok" && redis.status === "ok" ? "ok" : "degraded";
    const body = { status: overall, checks: { database, redis, minio } };

    if (overall === "degraded") {
      // A load balancer/orchestrator should stop routing to this instance —
      // 503 with the same diagnostic body, not a bare boolean.
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await this.dataSource.query("SELECT 1");
      return { status: "ok" };
    } catch (error) {
      return { status: "error", detail: (error as Error).message };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    try {
      const pong = await this.redis.ping();
      return pong === "PONG" ? { status: "ok" } : { status: "error", detail: `unexpected PING reply: ${pong}` };
    } catch (error) {
      return { status: "error", detail: (error as Error).message };
    }
  }
}

interface CheckResult {
  status: "ok" | "error" | "skipped";
  detail?: string;
}
