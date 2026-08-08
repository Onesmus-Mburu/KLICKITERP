# `tools/`

Operational tooling for Klickit Finance ERP — installers, backup scripts, seeders, fixtures (per the architecture doc's own layout comment). This directory is a small pnpm workspace package (`@klickit/tools`, added to `pnpm-workspace.yaml`) so its scripts can depend on `@klickit/server` and run via `ts-node` like every other runnable package in this monorepo.

## `bootstrap-admin.ts` — installer "bootstrap" step

Provisions a real System Admin account: forced password change on first login, plus an operator-driven 2FA enrollment walkthrough. It reuses this codebase's real, DI-wired NestJS services (`UsersService`, `RolesService`, `AuthService`, `PasswordService`, `TwoFactorService` — all from `@klickit/server`) via a one-shot `NestFactory.createApplicationContext(AppModule)` (no HTTP listener), rather than reimplementing bcrypt/2FA/session logic by hand or writing to the database with raw SQL.

**Scope note — read this before assuming it does more than it does.** `docs/phase-3/03-deployment-infrastructure.md` §4.1 describes a full guided installer (`install.sh`/`install.ps1`): OS preflight checks, TLS certificate setup, Docker Compose orchestration, database creation, running migrations, and — as its step 5 — "bootstrap: create System Admin (forced 2FA + password change)". **This script is ONLY that step 5.** It does not do OS preflight, does not configure TLS, does not bring up containers, and does not run migrations (it assumes migrations, including `0900-seed-permissions-and-roles.ts`'s "System Admin" role seed, have already run). The rest of that installer flow is Phase 9 (deployment infrastructure) scope — this codebase is currently Phase 5 (backend), and `apps/web`/a production Compose file/Nginx don't exist yet, so there is nothing for a real OS-level installer to orchestrate beyond what already runs in `docker-compose.dev.yml`.

### Commands

No interactive prompts anywhere — this environment's shell runs non-interactively (stdin attached to null), so every input is a `--flag`, never a `readline` prompt.

```bash
# 1. Create the System Admin account (refuses to create a second one unless --force —
#    checks ANY user holding the "System Admin" role, any status, not just ACTIVE).
pnpm --filter tools run bootstrap-admin -- create \
  --username bootstrap.admin \
  --full-name "Bootstrap Admin" \
  --email bootstrap.admin@klickit.local
  # (--phone also accepted; at least one of --email/--phone is required)
  # (--force to proceed even if a System Admin already exists)

# Prints the temporary password ONCE (CreateUserResult's own convention —
# UsersService.create() already generates it, bcrypt-hashes it at 12 rounds,
# and sets status=INVITED, mustChangePassword=true, twofaEnabled=false).

# 2. Start 2FA enrollment (prints an otpauthUri to scan + a manualKey to enter by hand
#    into any TOTP authenticator app).
pnpm --filter tools run bootstrap-admin -- enroll-2fa --username bootstrap.admin

# 3. Complete 2FA enrollment with a real 6-digit code from the authenticator app.
#    Prints one-time recovery codes ONCE.
pnpm --filter tools run bootstrap-admin -- verify-2fa --username bootstrap.admin --code 123456
```

`--filter tools run bootstrap-admin --` forwards everything after `--` to `ts-node bootstrap-admin.ts` (see `package.json`'s `bootstrap-admin` script). Equivalently, from inside `tools/`: `pnpm exec ts-node --project tsconfig.json bootstrap-admin.ts create ...`.

### Why it imports `apps/api`'s `AppModule`

The script imports `AppModule` from `../apps/api/src/app.module` (a relative path, not a package import — `apps/api` has no exported library surface, only a `dist/main.api.js` entry point). This reuses the exact same 22-module composition already proven to boot cleanly against this environment's Postgres/Redis (see `docs/phase-5/PROGRESS.md`'s "apps/api Composition Root" section) instead of assembling a slimmer bespoke module — no new module-wiring surface to get right. `tools/tsconfig.json` sets `rootDir` to the monorepo root specifically so this cross-package relative import type-checks cleanly (verified with a real `tsc --noEmit` run, not just `ts-node --transpile-only`) without hitting the same `TS6059` "not under rootDir" error the composition-root pass documented and avoided a different way (a package barrel) for `packages/server`.

`packages/server/src/index.ts`'s barrel gained a narrow, explicitly-documented export addition for this: `UsersService`/`RolesService`/`AuthService`/`PasswordService`/`TwoFactorService` (services only, never repositories — see that file's own doc comment for the full rationale and the two small new service methods, `UsersService.findByUsername`/`RolesService.listUserIdsForRole`, added instead of exporting repositories directly).

### Honest, known gap (not this tool's job to close)

`mustChangePassword`/`twofaEnabled` are advisory fields surfaced in the login response — nothing in this codebase enforces them at the request-guard level (no "must-change-password blocks all other endpoints" guard exists anywhere). This script drives the operator through completing both during provisioning ("forced" in the sense of "the bootstrap flow walks you through it"), but a user who ignores the `mustChangePassword: true` flag and simply calls other endpoints with their still-temporary password is not currently blocked from doing so. Building that runtime guard is a real, separate piece of work for whoever picks up runtime enforcement later — out of scope here.

### Cleanup note

An earlier verification pass (`apps/api` Composition Root, 2026-07-22) hand-seeded a throwaway `devadmin` fixture via raw SQL to prove a login round trip, since no real bootstrap tool existed yet. That row (and its `usr_session`/`usr_login_event`/`usr_user_role` rows) was deleted once this tool could provision a real account instead — see `docs/phase-5/PROGRESS.md`'s "Installer Bootstrap" section.
