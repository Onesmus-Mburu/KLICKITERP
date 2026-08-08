import { Global, Module } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { redisClientProvider } from "../cache/redis.provider";

/**
 * `apps/api` composition root finding: 6 modules (`platform/auth`,
 * `licensing`, `domains/backups-ops`, `platform/files`, `domains/payroll`,
 * `platform/settings`) each independently declared their own local
 * `AppConfigService` provider, and 4 modules (`platform/auth`, `licensing`,
 * `domains/backups-ops`, `domains/reporting`) each independently declared
 * their own local `redisClientProvider` — a real `FactoryProvider` that opens
 * a brand-new `ioredis` TCP connection (`lazyConnect: false`) per
 * declaration. Every one of those modules' own doc comments candidly
 * documented this as "the self-contained registration precedent... no
 * cross-module DI export of `REDIS_CLIENT` exists anywhere in this
 * codebase" — true when each module was built and tested in isolation, but
 * composed together into one `AppModule` (this file's whole reason to
 * exist) it means up to 4 separate live Redis connections opened at boot
 * for a single logical client, and up to 6 redundant (if harmless, since
 * `AppConfigService` is stateless) instances of the config service.
 *
 * This module is the fix: registers `AppConfigService`/`redisClientProvider`
 * ONCE, `@Global()` so every module in the tree can inject `AppConfigService`
 * or `@Inject(REDIS_CLIENT)` without adding `SharedInfraModule` to its own
 * `imports` array (Nest's global-module semantics — imported once, here, by
 * `AppModule`, and its exports become available everywhere). Lives under
 * `shared/` (not `apps/api/`) specifically so `licensing` — which per
 * `module-deps.json` may import `shared` ONLY (`"mayImport": ["shared"]`,
 * `"importableBy": []`) — stays consistent with its own isolation rule.
 * That was verified FIRST, before touching `licensing.module.ts` at all:
 * since `SharedInfraModule` lives under `shared/`, removing licensing's own
 * local `AppConfigService`/`redisClientProvider` registration and relying
 * on the global one does not add any import edge outside `shared` — the
 * isolation rule is unaffected. With that confirmed safe, licensing's local
 * registration WAS removed, the same as the other 6 modules (see that
 * file's own updated doc comment) — there is no surviving local
 * registration anywhere for either provider.
 *
 * The 7 affected module files (`auth.module.ts`, `licensing.module.ts`,
 * `backups-ops.module.ts`, `files.module.ts`, `payroll.module.ts`,
 * `settings.module.ts`, `reporting.module.ts`) each had their local
 * `AppConfigService`/`redisClientProvider` provider-array entries removed;
 * every file that still needs the *type* for constructor injection (e.g.
 * `files.module.ts`'s `MulterModule.registerAsync({ inject: [AppConfigService] })`
 * factory) keeps its plain `import` statement — only the redundant `@Module`
 * provider registration was deleted. No service/guard/controller file
 * anywhere was touched; every existing `@Inject(REDIS_CLIENT)`/constructor
 * `AppConfigService` injection continues to resolve identically, now from
 * one shared singleton instead of a per-module one.
 */
@Global()
@Module({
  providers: [AppConfigService, redisClientProvider],
  exports: [AppConfigService, redisClientProvider],
})
export class SharedInfraModule {}
