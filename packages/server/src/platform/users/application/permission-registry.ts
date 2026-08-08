/**
 * FR-USER-001.1 — "Permission catalogue is code-generated from module
 * decorators at build time and seeded by migration." With only Module 1
 * built, a full `ts-morph`/regex scan over every `*.controller.ts` for
 * `@RequirePermission(...)` call sites is more machinery than the current
 * codebase warrants; this is the pragmatic static-registry version of that
 * same contract, structured so it scales to the scan-based approach later
 * without changing callers: each module declares its own
 * `<module>/domain/permission-catalogue.ts` array (see
 * `users/domain/permission-catalogue.ts`) and calls `registerPermissions()`
 * once at import time. Migration `0900` reads the per-module catalogue
 * arrays directly (not this registry) because a standalone migration runner
 * process never imports the Nest modules whose side effects populate it —
 * this registry exists for a future build-time catalogue-export script /
 * runtime introspection (e.g. an admin "permission catalogue" screen) to
 * consume, not for seeding.
 */
export interface PermissionCatalogueEntry {
  /** `module:resource:action`, e.g. `users:user:suspend`. */
  code: string;
  /** Matches `usr_permission.module` (docs/phase-4/02-schema-platform-accounting.md §2). */
  module: string;
  description: string;
  /** BR-SEC-04 — auditor-class roles may never hold an `isWrite` permission. */
  isWrite: boolean;
}

const registry = new Map<string, PermissionCatalogueEntry>();

/** Idempotent by `code` — re-importing a module's catalogue (e.g. in tests) never duplicates entries. */
export function registerPermissions(entries: readonly PermissionCatalogueEntry[]): void {
  for (const entry of entries) {
    registry.set(entry.code, entry);
  }
}

export function getRegisteredPermissions(): readonly PermissionCatalogueEntry[] {
  return Array.from(registry.values());
}
