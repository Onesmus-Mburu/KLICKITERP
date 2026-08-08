import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { Logger, RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppConfigService } from "@klickit/server";
import { AppModule } from "./app.module";

// Same repo-root-relative resolution `migrations/data-source.ts` already
// established (its own doc comment documents the bug this fixes: dotenv's
// default `config()` resolves `.env` against `process.cwd()`, which is
// wrong whenever this file is run from `apps/api` via
// `pnpm --filter api run start:dev`/`start`, not the repo root). Must run
// BEFORE `AppModule`/`@klickit/server` is imported so every `AppConfigService`
// getter and `TypeOrmModule.forRoot()`'s `process.env.DB_*` reads see the
// real `.env` values, not their hardcoded dev fallbacks.
loadDotenv({ path: resolve(__dirname, "../../../.env") });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  // `/health`/`/health/ready` stay OUTSIDE the `/api/v1` prefix — a load
  // balancer/orchestrator (Docker healthcheck, Nginx upstream check) expects
  // bare `/health`, per docs/phase-3/01-system-architecture.md §5 and
  // `health.controller.ts`'s own doc comment.
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
    ],
  });

  // Permissive for local dev (any origin, credentials allowed) — production
  // deployments must restrict `origin` to the real `apps/web` origin(s) via
  // config (e.g. a `CORS_ALLOWED_ORIGINS` env var); no such restriction
  // exists yet anywhere in this codebase, an honestly documented gap for
  // whichever pass wires real deployment config.
  app.enableCors({ origin: true, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Klickit Finance ERP API")
    .setDescription("Single-tenant school finance ERP — REST API v1")
    .setVersion(readRootPackageVersion())
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(config.port);
  Logger.log(`Klickit Finance ERP API listening on port ${config.port} (env: ${config.nodeEnv})`, "Bootstrap");
  Logger.log(`Swagger docs: http://localhost:${config.port}/api/docs`, "Bootstrap");
}

/** Reads the monorepo root `package.json`'s `version` field for the Swagger document — never hand-duplicated. */
function readRootPackageVersion(): string {
  try {
    const raw = readFileSync(resolve(__dirname, "../../../package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

bootstrap().catch((error) => {
  Logger.error("Fatal error during bootstrap", error instanceof Error ? error.stack : String(error), "Bootstrap");
  process.exit(1);
});
