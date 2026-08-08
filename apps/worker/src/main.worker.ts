import "reflect-metadata";
import * as http from "node:http";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { HttpException, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppConfigService } from "@klickit/server";
import { HealthController } from "../../api/src/health.controller";
import { AppModule } from "./app.module";

// Same repo-root-relative resolution `apps/api/src/main.api.ts` already
// established (see that file's own doc comment for the bug this fixes:
// dotenv's default `config()` resolves `.env` against `process.cwd()`,
// wrong whenever this file runs via `pnpm --filter worker run start:dev`,
// not the repo root). Must run BEFORE `AppModule`/`@klickit/server` is
// imported so every `AppConfigService` getter and `TypeOrmModule.forRoot()`'s
// `process.env.DB_*` reads see the real `.env` values.
loadDotenv({ path: resolve(__dirname, "../../../.env") });

/**
 * `apps/worker`'s entrypoint — ADR-003's `main.worker.ts`
 * (docs/phase-3/01-system-architecture.md §2.1). This process must expose
 * NO REST API surface (no `/api/v1/*`, none of the ~509 routes the 22
 * imported modules' controllers register) — ONLY a bare `/health`+
 * `/health/ready` for the worker's own container health probe
 * (docs/phase-3/01-system-architecture.md §7: "`/health`... per
 * container").
 *
 * **Real gap this fixes vs. a naive first attempt**: calling
 * `NestFactory.create(AppModule)` + `app.listen()` — the same pattern
 * `apps/api/src/main.api.ts` uses — does NOT stop at exposing only
 * `HealthController`'s two routes: Nest's HTTP adapter registers EVERY
 * `@Controller()` found anywhere in the imported module tree the instant
 * `app.listen()` is called, so `AppModule`'s 22 imported modules would have
 * silently put the full ~509-route REST surface live on `WORKER_PORT` too
 * (confirmed empirically during this build — a live boot showed every
 * module's `RouterExplorer` "Mapped {...} route" log line, exactly the
 * outcome this file exists to prevent). Fixed by using
 * `NestFactory.createApplicationContext(AppModule)` instead: it fully
 * instantiates the whole DI graph (every module's services/repositories,
 * needed so a future real BullMQ processor "living beside its module's
 * services" per ADR-003 can be added later) and runs Nest's lifecycle hooks
 * (`OnModuleInit`, etc. — `OutboxQueueModule`'s `OutboxPollScheduler`
 * schedules its BullMQ repeatable job via exactly this hook) but creates NO
 * HTTP adapter and registers NO routes at all.
 *
 * The two health routes are then served by a plain `http.createServer()`
 * (deliberately not a second Nest HTTP application, so it carries zero
 * route surface beyond these two paths) that resolves `HealthController` —
 * `apps/api/src/health.controller.ts` itself, reused directly, not forked —
 * from THIS SAME application context via `appContext.get()`. That reuses
 * the exact same `DataSource`/Redis client instances this process already
 * opened for its module graph (no duplicate DB/Redis connections just for
 * health checks), and the response bodies are byte-for-byte identical to
 * `apps/api`'s own `/health`/`/health/ready` because it is the literal same
 * class and methods being called, not a re-implementation that could drift.
 */
async function bootstrap(): Promise<void> {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const config = appContext.get(AppConfigService);
  const healthController = appContext.get(HealthController);

  const server = http.createServer((req, res) => {
    void handleHealthRequest(healthController, req, res);
  });

  await new Promise<void>((resolveListen) => server.listen(config.workerPort, resolveListen));
  Logger.log(
    `Klickit Finance ERP Worker listening on port ${config.workerPort} (env: ${config.nodeEnv}) — /health, /health/ready only, no REST surface`,
    "Bootstrap",
  );
}

/**
 * Manual tiny router for the bare HTTP server above. `HealthController.readiness()`
 * throws a `ServiceUnavailableException` (503, full diagnostic body as its
 * response payload) when DB/Redis is down — this bare server has no
 * `AllExceptionsFilter` of its own (that filter is Nest-HTTP-pipeline-only,
 * and this route deliberately isn't part of that pipeline), so the same
 * status/body is replicated here explicitly.
 */
async function handleHealthRequest(
  healthController: HealthController,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const path = (req.url ?? "/").split("?")[0].replace(/\/+$/, "") || "/";
  res.setHeader("Content-Type", "application/json");

  try {
    if (req.method === "GET" && path === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify(healthController.liveness()));
      return;
    }
    if (req.method === "GET" && path === "/health/ready") {
      const body = await healthController.readiness();
      res.writeHead(200);
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not Found" }));
  } catch (error) {
    if (error instanceof HttpException) {
      res.writeHead(error.getStatus());
      res.end(JSON.stringify(error.getResponse()));
      return;
    }
    Logger.error(
      "Unexpected error handling worker health request",
      error instanceof Error ? error.stack : String(error),
      "Bootstrap",
    );
    res.writeHead(500);
    res.end(JSON.stringify({ status: "error" }));
  }
}

bootstrap().catch((error) => {
  Logger.error("Fatal error during bootstrap", error instanceof Error ? error.stack : String(error), "Bootstrap");
  process.exit(1);
});
