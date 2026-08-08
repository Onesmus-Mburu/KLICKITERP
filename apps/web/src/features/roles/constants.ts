/**
 * Real, distinct `module` values across the seeded `usr_permission` table —
 * confirmed directly via `psql` (`SELECT DISTINCT module FROM
 * app.usr_permission ORDER BY module;`), not guessed: 24 rows returned,
 * exactly these 24 values, alphabetically ordered. Mirrors
 * `features/settings/constants.ts`'s own `CUSTOM_FIELD_ENTITIES`/
 * `INTEGRATION_KINDS` hand-duplicated-catalogue convention — no server
 * endpoint returns the distinct module list on its own (`GET /permissions`
 * returns the 259 individual permission rows, not their distinct modules),
 * so this is a client-side mirror of the real seed data
 * (`packages/server/src/platform/users/domain/permission-catalogue.ts`).
 */
export const PERMISSION_MODULES: readonly string[] = [
  "accounting",
  "approvals",
  "auth",
  "backups",
  "banking",
  "billing",
  "branding",
  "comms",
  "dashboard",
  "expenses",
  "files",
  "fixed-assets",
  "integrations",
  "inventory",
  "license",
  "ops",
  "payments",
  "payroll",
  "procurement",
  "reports",
  "settings",
  "students",
  "users",
  "wallet",
];
