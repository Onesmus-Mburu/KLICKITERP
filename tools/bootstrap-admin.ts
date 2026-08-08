/**
 * Klickit Finance ERP — installer "bootstrap" step: provisions a real
 * System Admin account (forced password change + 2FA enrollment).
 *
 * This is ONLY the "bootstrap: create System Admin" sub-step of the guided
 * installer flow docs/phase-3/03-deployment-infrastructure.md §4.1
 * describes — not the OS-level installer (`install.sh`/`install.ps1`: OS
 * preflight, TLS, compose orchestration). That whole installer is Phase 9
 * deployment-infrastructure scope; this codebase is still Phase 5
 * (backend) and has no `apps/web`/prod compose/Nginx yet. See
 * `tools/README.md` for the full scope note and
 * `docs/phase-5/PROGRESS.md`'s "Installer Bootstrap (System Admin
 * provisioning)" section for the build/verification write-up.
 *
 * Runs as a one-shot `NestFactory.createApplicationContext(AppModule)` —
 * no HTTP listener — so every command gets real, DI-wired instances of
 * `UsersService`/`RolesService`/`AuthService`/`PasswordService`/
 * `TwoFactorService` exactly as the running `apps/api` process would
 * construct them (real bcrypt hashing, real TOTP secrets, real DB writes)
 * instead of reimplementing any of that by hand or reaching for raw SQL.
 * Reuses `apps/api/src/app.module.ts`'s own `AppModule` verbatim (imported
 * by relative path — `tools/` is a sibling workspace package to `apps/api`
 * with no exported library surface for `AppModule`, so this is a plain
 * TypeScript source import, not a `@klickit/api` package import) rather
 * than assembling a slimmer bespoke module: no new module-wiring surface
 * to get right, and it's already proven (see the "apps/api Composition
 * Root" PROGRESS.md section) to boot cleanly against this same DB/Redis.
 *
 * No interactive prompts anywhere (this environment's shell runs
 * non-interactively — a `readline` prompt would hang or read EOF
 * immediately) — every input is a `--flag`.
 *
 * Commands:
 *   create      --username <u> --full-name "<name>" [--email <e>] [--phone <p>] [--force]
 *   enroll-2fa  --username <u>
 *   verify-2fa  --username <u> --code <totp>
 */

import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

// Must execute BEFORE `AppModule` (and anything from `@klickit/server`) is
// imported below: TypeScript's CommonJS output does NOT hoist `import`
// declarations above interspersed statements (verified empirically, not
// assumed — imports are `require()`'d in exact source order), and
// `apps/api/src/app.module.ts`'s `TypeOrmModule.forRoot()` reads
// `process.env.DB_HOST`/etc. synchronously at module-evaluation time (i.e.
// the moment the `import` below runs), not lazily. `tools/` sits one level
// below the repo root (unlike `apps/api/src/main.api.ts`'s three levels),
// hence `../.env` here vs. that file's `../../../.env`.
loadDotenv({ path: resolve(__dirname, "../.env") });

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../apps/api/src/app.module";
import {
  UsersService,
  RolesService,
  TwoFactorService,
  type CreateUserResult,
} from "@klickit/server";

// Matches migration `0900-seed-permissions-and-roles.ts`'s own
// `SYSTEM_ADMIN_ROLE` constant — not exported from that file (migrations
// don't export symbols for application code to import), so restated here.
const SYSTEM_ADMIN_ROLE = "System Admin";

type Flags = Record<string, string | boolean>;
type AppContext = Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

function parseArgs(argv: string[]): { command: string | undefined; flags: Flags } {
  const [command, ...rest] = argv;
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function requireFlag(flags: Flags, name: string): string {
  const value = flags[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required --${name} <value> flag`);
  }
  return value;
}

function optionalFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function printOnceBanner(title: string, body: string): void {
  const lines = body.split("\n");
  const width = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
  const bar = "=".repeat(width);
  console.log(bar);
  console.log(`  ${title}`);
  console.log(bar);
  for (const line of lines) console.log(`  ${line}`);
  console.log(bar);
}

function printUsage(): void {
  console.log(`
Klickit Finance ERP — bootstrap-admin CLI
Provisions a real System Admin account (forced password change + 2FA
enrollment). This is the installer's "bootstrap" sub-step only — see
tools/README.md.

Usage:
  create      --username <u> --full-name "<name>" [--email <e>] [--phone <p>] [--force]
  enroll-2fa  --username <u>
  verify-2fa  --username <u> --code <totp>

Example (via the workspace script):
  pnpm --filter tools run bootstrap-admin -- create --username bootstrap.admin --full-name "Bootstrap Admin" --email bootstrap.admin@klickit.local
`);
}

async function runCreate(app: AppContext, flags: Flags): Promise<void> {
  const username = requireFlag(flags, "username");
  const fullName = requireFlag(flags, "full-name");
  const email = optionalFlag(flags, "email");
  const phone = optionalFlag(flags, "phone");
  const force = flags["force"] === true;

  if (!email && !phone) {
    throw new Error("A System Admin account needs a contact — pass --email and/or --phone");
  }

  const usersService = app.get(UsersService);
  const rolesService = app.get(RolesService);

  const roles = await rolesService.list();
  const systemAdminRole = roles.find((r) => r.name === SYSTEM_ADMIN_ROLE);
  if (!systemAdminRole) {
    throw new Error(
      `"${SYSTEM_ADMIN_ROLE}" role not found in app.usr_role — run migrations first ` +
        `(migration 0900 seeds it: pnpm --filter @klickit/server run migration:run)`,
    );
  }

  const existingHolders = await rolesService.listUserIdsForRole(systemAdminRole.id);
  if (existingHolders.length > 0 && !force) {
    throw new Error(
      `Refusing to create a second System Admin: ${existingHolders.length} user(s) already hold ` +
        `the "${SYSTEM_ADMIN_ROLE}" role (user id(s): ${existingHolders.join(", ")}). ` +
        `Pass --force to proceed anyway, or remove the existing holder(s) first.`,
    );
  }

  const result: CreateUserResult = await usersService.create(
    { username, fullName, email: email ?? null, phone: phone ?? null, userType: "SYSTEM" },
    null,
  );
  await rolesService.assignRoleToUser(result.user.id, systemAdminRole.id);

  console.log(`\nSystem Admin account created.`);
  console.log(`  id:               ${result.user.id}`);
  console.log(`  username:         ${result.user.username}`);
  console.log(`  status:           ${result.user.status}`);
  console.log(`  mustChangePassword: ${result.user.mustChangePassword}`);
  console.log(`  twofaEnabled:     ${result.user.twofaEnabled}`);
  console.log(`  role:             ${SYSTEM_ADMIN_ROLE}`);
  console.log();
  printOnceBanner("TEMPORARY PASSWORD — shown once, will not be displayed again", result.temporaryPassword);
  console.log(
    `\nNext: log in with this password (the app forces a password change on first successful login), ` +
      `then run enroll-2fa/verify-2fa to complete 2FA enrollment.\n`,
  );
}

async function runEnroll(app: AppContext, flags: Flags): Promise<void> {
  const username = requireFlag(flags, "username");
  const usersService = app.get(UsersService);
  const twoFactorService = app.get(TwoFactorService);

  const user = await usersService.findByUsername(username);
  if (!user) {
    throw new Error(`No such user: ${username}`);
  }

  const { otpauthUri, manualKey } = await twoFactorService.enroll(user.id);

  console.log(`\n2FA enrollment started for "${username}".`);
  console.log(`  otpauthUri: ${otpauthUri}`);
  console.log(`  manualKey:  ${manualKey}`);
  console.log(
    `\nScan the otpauthUri as a QR code in an authenticator app (or enter manualKey manually), then run:\n` +
      `  verify-2fa --username ${username} --code <6-digit code>\n`,
  );
}

async function runVerify(app: AppContext, flags: Flags): Promise<void> {
  const username = requireFlag(flags, "username");
  const code = requireFlag(flags, "code");
  const usersService = app.get(UsersService);
  const twoFactorService = app.get(TwoFactorService);

  const user = await usersService.findByUsername(username);
  if (!user) {
    throw new Error(`No such user: ${username}`);
  }

  const { recoveryCodes } = await twoFactorService.activateEnroll(user.id, code);

  console.log(`\n2FA activated for "${username}".`);
  console.log();
  printOnceBanner("RECOVERY CODES — shown once, will not be displayed again", recoveryCodes.join("\n"));
  console.log();
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (!command) {
    printUsage();
    throw new Error("No command given");
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["warn", "error"],
  });

  try {
    switch (command) {
      case "create":
        await runCreate(app, flags);
        break;
      case "enroll-2fa":
        await runEnroll(app, flags);
        break;
      case "verify-2fa":
        await runVerify(app, flags);
        break;
      default:
        printUsage();
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    // Never leave a dangling connection/process — this is a one-shot CLI.
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("\nbootstrap-admin failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
