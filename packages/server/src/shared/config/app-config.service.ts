import { Injectable } from "@nestjs/common";

export interface JwtKeyPair {
  kid: string;
  privateKey: string;
  publicKey: string;
}

export interface NamedPublicKey {
  kid: string;
  publicKey: string;
}

function parseJwtKeyPair(raw: string | undefined, fallback: string): JwtKeyPair {
  const source = raw && raw.length > 0 ? raw : fallback;
  const parsed = JSON.parse(source) as JwtKeyPair;
  if (!parsed.kid || !parsed.privateKey || !parsed.publicKey) {
    throw new Error("Invalid JWT keypair configuration: expected {kid, privateKey, publicKey}");
  }
  return parsed;
}

function parseNamedPublicKey(raw: string | undefined, fallback: string): NamedPublicKey {
  const source = raw && raw.length > 0 ? raw : fallback;
  const parsed = JSON.parse(source) as NamedPublicKey;
  if (!parsed.kid || !parsed.publicKey) {
    throw new Error("Invalid public-key configuration: expected {kid, publicKey}");
  }
  return parsed;
}

/**
 * Minimal typed env-var access for runtime configuration. Module 1 is the
 * first module that needs configurable runtime values (JWT keys, lockout
 * thresholds, OTP windows, envelope-encryption key) beyond the DB connection
 * settings `data-source.ts` already reads directly from `process.env` — this
 * fills that gap for application code (services/guards) rather than
 * migrations. Deliberately not `@nestjs/config`: a plain injectable keeps the
 * shared kernel dependency-free and the surface area is still small.
 *
 * Every getter falls back to a safe development default so unit tests and
 * local dev don't require a `.env` file — `.env.example` documents the real
 * production keys operators must set (`JWT_KEY_CURRENT`, `APP_ENCRYPTION_KEY`).
 */
@Injectable()
export class AppConfigService {
  /**
   * `apps/api` composition root — `.env.example`'s "Core" group `PORT`,
   * consumed by `main.api.ts`'s `app.listen(config.port)`. Default `3000`
   * matches `.env.example`/the real verification `.env` exactly, same
   * "every default is a valid, matching dev value" convention every other
   * getter in this class follows.
   */
  get port(): number {
    return Number(process.env.PORT ?? 3000);
  }

  /** `.env.example`'s "Core" group `NODE_ENV` — `main.api.ts`'s CORS/Swagger setup reads this to decide dev-permissive vs. production-restrictive behaviour. */
  get nodeEnv(): string {
    return process.env.NODE_ENV ?? "development";
  }

  /**
   * `apps/worker` composition root (2026-07-28) — its own bare `/health`
   * + `/health/ready` HTTP surface listens here, distinct from `apps/api`'s
   * `port`/3000 (docs/phase-3/01-system-architecture.md §7: "`/health`...
   * per container" — worker is its own container). No prior convention
   * existed for this in `.env.example`; `3001` was chosen as the next free
   * port after `apps/api`'s `3000` and documented there now.
   */
  get workerPort(): number {
    return Number(process.env.WORKER_PORT ?? 3001);
  }

  /**
   * `apps/worker`'s outbox-dispatcher poll cadence — matches
   * docs/phase-3/02-communication-authentication.md §1.3's own documented
   * figure ("outbox dispatcher (worker, 250ms poll / LISTEN-NOTIFY)"); this
   * codebase implements the polling half only (see
   * `OutboxDispatcherService`'s doc comment — no LISTEN/NOTIFY).
   */
  get outboxPollIntervalMs(): number {
    return Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 250);
  }

  /** `OutboxDispatcherService.pollOnce()`'s batch size — matches the task brief's own "LIMIT 100" figure. */
  get outboxBatchSize(): number {
    return Number(process.env.OUTBOX_BATCH_SIZE ?? 100);
  }

  get redisUrl(): string {
    return process.env.REDIS_URL ?? "redis://localhost:6379";
  }

  /**
   * ES256 keypair, JSON-encoded `{kid, privateKey, publicKey}` (PEM strings)
   * per `.env.example`'s `JWT_KEY_CURRENT`. Kept as one JSON blob (rather
   * than two separate env vars) so the `kid` travels with its matching
   * keypair, which is what the JWT `kid` header and rotation logic key off.
   */
  get jwtKeyCurrent(): JwtKeyPair {
    return parseJwtKeyPair(process.env.JWT_KEY_CURRENT, DEV_JWT_KEYPAIR_JSON);
  }

  /** Previous keypair kept during a rotation overlap window; verification tries current then previous by `kid`. */
  get jwtKeyPrevious(): JwtKeyPair | null {
    if (!process.env.JWT_KEY_PREVIOUS || process.env.JWT_KEY_PREVIOUS.length === 0) {
      return null;
    }
    return parseJwtKeyPair(process.env.JWT_KEY_PREVIOUS, DEV_JWT_KEYPAIR_JSON);
  }

  /** docs/phase-3/02-communication-authentication.md §2.7 — 15 min, configurable 5-60. */
  get accessTokenTtlMinutes(): number {
    return Number(process.env.AUTH_ACCESS_TTL_MIN ?? 15);
  }

  /** §2.7 — 7 days, configurable 1-30. */
  get refreshTokenTtlDays(): number {
    return Number(process.env.AUTH_REFRESH_TTL_DAYS ?? 7);
  }

  /** §2.7 — pre-auth (2FA) token, single-use, 90s. */
  get preauthTokenTtlSeconds(): number {
    return Number(process.env.AUTH_PREAUTH_TTL_SEC ?? 90);
  }

  /** §2.7 — OTP, 5 min. */
  get otpTtlSeconds(): number {
    return Number(process.env.AUTH_OTP_TTL_SEC ?? 300);
  }

  /** FR-AUTH-013.1 — max 3 sends/hour/phone. */
  get otpMaxSendsPerHourPerPhone(): number {
    return Number(process.env.AUTH_OTP_MAX_PER_PHONE ?? 3);
  }

  /** §2.2 — 10 sends/hour/IP. */
  get otpMaxSendsPerHourPerIp(): number {
    return Number(process.env.AUTH_OTP_MAX_PER_IP ?? 10);
  }

  /** FR-AUTH-013.1 — max 5 verify attempts per OTP. */
  get otpMaxVerifyAttempts(): number {
    return Number(process.env.AUTH_OTP_MAX_ATTEMPTS ?? 5);
  }

  /** FR-AUTH-007.1 — 5 fails/15 min window. */
  get lockoutMaxFailures(): number {
    return Number(process.env.AUTH_LOCKOUT_MAX_FAILS ?? 5);
  }

  get lockoutWindowMinutes(): number {
    return Number(process.env.AUTH_LOCKOUT_WINDOW_MIN ?? 15);
  }

  get lockoutDurationMinutes(): number {
    return Number(process.env.AUTH_LOCKOUT_DURATION_MIN ?? 15);
  }

  /** §2.4 — API key bearer prefix, FR-API-003. */
  get apiKeyPrefix(): string {
    return process.env.AUTH_API_KEY_PREFIX ?? "kfe_live_";
  }

  /** AES-256-GCM master key (base64, 32 bytes) used to envelope-encrypt 2FA secrets/recovery codes. */
  get appEncryptionKeyBase64(): string {
    return process.env.APP_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY_BASE64;
  }

  /** Password reset token TTL — §2.7, 30 min. */
  get passwordResetTtlSeconds(): number {
    return Number(process.env.AUTH_PASSWORD_RESET_TTL_SEC ?? 1800);
  }

  /**
   * MinIO (S3-compatible) object store — docs/phase-3/01-system-architecture.md
   * C4 diagram ("MinIO (S3) files, exports, backups") and
   * docs/phase-3/03-deployment-infrastructure.md §3 `Storage` env group.
   * `minioEndpoint` is `host:port` (no scheme) — `MinioStorageAdapter` builds
   * the full URL from this plus `minioUseSsl`. Dev defaults match the
   * `docker-compose.dev.yml` MinIO service (not yet brought up in this
   * environment — see PROGRESS.md "Environment status") so local dev/tests
   * don't require a `.env` file, mirroring every other getter in this class.
   */
  get minioEndpoint(): string {
    return process.env.MINIO_ENDPOINT ?? "localhost:9000";
  }

  get minioAccessKey(): string {
    return process.env.MINIO_ACCESS_KEY ?? "minioadmin";
  }

  get minioSecretKey(): string {
    return process.env.MINIO_SECRET_KEY ?? "minioadmin";
  }

  get minioBucketDefault(): string {
    return process.env.MINIO_BUCKET_DEFAULT ?? "klickit-files";
  }

  get minioUseSsl(): boolean {
    return process.env.MINIO_USE_SSL === "true";
  }

  /** Module 3 (Files) upload guard — FR/NFR reference: reasonable default, school-configurable. Default 25 MiB. */
  get fileMaxUploadBytes(): number {
    return Number(process.env.FILE_MAX_UPLOAD_BYTES ?? 26_214_400);
  }

  /**
   * Allow-listed MIME types for uploads (images, PDF, common office docs) —
   * comma-separated override via `FILE_ALLOWED_MIME_TYPES`, default covers
   * the documents a school ERP realistically handles (ID scans, receipts,
   * signed forms, spreadsheets).
   */
  get fileAllowedMimeTypes(): string[] {
    const raw = process.env.FILE_ALLOWED_MIME_TYPES;
    if (raw && raw.length > 0) {
      return raw.split(",").map((entry) => entry.trim());
    }
    return DEFAULT_ALLOWED_MIME_TYPES;
  }

  /**
   * Module 19 (Integrations) FR-INTG-007.1 auto-disable admin alert —
   * `WebhookDeliveryService` sends a best-effort `NotificationsService.send()`
   * EMAIL here once a subscription is auto-disabled after 72h of hard
   * failures. Dev default is an obviously-fake local address so the alert
   * path is exercisable without a `.env` file, same convention every other
   * getter in this class follows.
   */
  get integrationsAdminAlertEmail(): string {
    return process.env.INTEGRATIONS_ADMIN_ALERT_EMAIL ?? "admin@klickit.local";
  }

  /**
   * Module 20 (Backups/Ops) — the app runtime DB connection (`kfe_app`,
   * DML-only role), mirroring `.env.example`'s "Database" group and the
   * exact env var names `migrations/data-source.ts` reads directly (that
   * file is migration-only, `DB_MIGRATION_USER`/`DB_MIGRATION_PASSWORD`;
   * this is the first APPLICATION-code consumer of the app-role DB
   * connection, needed so `BackupOrchestratorService` can shell out
   * `pg_dump`/`pg_restore` against the live database without duplicating
   * TypeORM's own connection wiring — `pg_dump` only needs SELECT
   * privileges, which the DML-only app role already has).
   */
  get dbHost(): string {
    return process.env.DB_HOST ?? "localhost";
  }

  get dbPort(): number {
    return Number(process.env.DB_PORT ?? 5432);
  }

  get dbName(): string {
    return process.env.DB_NAME ?? "klickit_dev";
  }

  get dbUser(): string {
    return process.env.DB_USER ?? "kfe_app";
  }

  get dbPassword(): string {
    return process.env.DB_PASSWORD ?? "changeme";
  }

  get dbSsl(): boolean {
    return process.env.DB_SSL === "true";
  }

  /**
   * Module 20 (Backups/Ops) — AES-256-GCM passphrase encrypting every backup
   * archive (docs/phase-3/03-deployment-infrastructure.md §3 Storage group:
   * "schools told: lose this = backups unreadable"). Dev default is an
   * obviously-fake, clearly-labeled placeholder so the backup flow is
   * exercisable without a `.env` file, same convention every other getter in
   * this class follows — production deployments always set the real
   * `BACKUP_PASSPHRASE` env var.
   */
  get backupPassphrase(): string {
    return process.env.BACKUP_PASSPHRASE ?? "dev-only-insecure-backup-passphrase-change-in-production";
  }

  /** Local on-disk backup destination (7-daily GFS tier, docs/phase-3 §6). Relative paths resolve against the process cwd. */
  get backupLocalDir(): string {
    return process.env.BACKUP_LOCAL_DIR ?? "./data/backups";
  }

  /** MinIO bucket for the 4-weekly GFS mirror tier — deliberately distinct from `minioBucketDefault` (Module 3 Files) so backup archives never share a bucket with user-uploaded documents. */
  get backupMinioBucket(): string {
    return process.env.BACKUP_MINIO_BUCKET ?? "klickit-backups";
  }

  /**
   * Module 21 (Licensing) — this school instance's own identifier, the
   * `aud` (audience) every inbound Super Admin JWS request must carry
   * (docs/phase-3/02-communication-authentication.md §2.6) and the
   * `school_id` a license file's payload must match. Already declared in
   * `.env.example`'s "Core" group (`SCHOOL_ID`) since Module 1 — this is the
   * first application-code getter to read it (every earlier module only
   * needed it, if at all, for display purposes outside `AppConfigService`).
   */
  get schoolId(): string {
    return process.env.SCHOOL_ID ?? "dev-school";
  }

  /**
   * Module 21 (Licensing) — Ed25519 PEM public key(s) baked into the build
   * at release time (FR-LIC-001.1: "Infoney private key; public key baked
   * into build"), used BOTH to verify a license file's Ed25519 signature
   * (`LicenseFileVerifier`) and to verify inbound Super Admin portal JWS
   * requests (`JwsMutualAuthService`, docs/phase-3/02-communication-authentication.md
   * §2.6) — the docs never distinguish two separate Infoney keypairs for
   * these two purposes, so this pass deliberately reuses one, a documented
   * simplification (see docs/phase-5/PROGRESS.md's Module 21 row). JSON
   * `{kid, publicKey}`, same shape/rotation convention as
   * `jwtKeyCurrent`/`jwtKeyPrevious` above (dual-key overlap window per
   * §2.6's "key rotation via dual-key overlap windows").
   */
  get infoneyLicensePublicKeyCurrent(): NamedPublicKey {
    return parseNamedPublicKey(process.env.INFONEY_LICENSE_PUBLIC_KEY_CURRENT, DEV_INFONEY_PUBLIC_KEY_JSON);
  }

  get infoneyLicensePublicKeyPrevious(): NamedPublicKey | null {
    if (!process.env.INFONEY_LICENSE_PUBLIC_KEY_PREVIOUS || process.env.INFONEY_LICENSE_PUBLIC_KEY_PREVIOUS.length === 0) {
      return null;
    }
    return parseNamedPublicKey(process.env.INFONEY_LICENSE_PUBLIC_KEY_PREVIOUS, DEV_INFONEY_PUBLIC_KEY_JSON);
  }

  /**
   * Module 21 (Licensing) — this INSTANCE's own Ed25519 private key
   * (raw PEM, docs/phase-3/03-deployment-infrastructure.md §3's `Licensing`
   * env group: `INSTANCE_PRIVATE_KEY`), used to sign outbound `/license/v1/*`
   * responses (§2.6: "response signed with INSTANCE private key"). Its
   * public half is registered with the Infoney Super Admin portal at
   * provisioning time — this codebase has no provisioning-time registration
   * flow to call, an honestly documented gap (docs/phase-5/PROGRESS.md).
   */
  get instancePrivateKeyPem(): string {
    return process.env.INSTANCE_PRIVATE_KEY && process.env.INSTANCE_PRIVATE_KEY.length > 0
      ? process.env.INSTANCE_PRIVATE_KEY
      : DEV_INSTANCE_PRIVATE_KEY_PEM;
  }

  /**
   * Module 21 (Licensing) — filesystem path to the signed license file this
   * instance validates at boot + every 6h (FR-LIC-001.1). No real bootstrap
   * entry point exists anywhere in this codebase yet (every module is
   * unit/integration tested standalone — see docs/phase-5/PROGRESS.md
   * "Environment status") to actually call `LicenseFileService`'s
   * `OnModuleInit` hook at process start, an honestly documented gap.
   */
  get licenseFilePath(): string {
    return process.env.LICENSE_FILE_PATH ?? "./data/license/license.json";
  }
}

/** Default allow-list backing `AppConfigService.fileAllowedMimeTypes` — images, PDF, common office docs. */
const DEFAULT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
];

/**
 * Fixed development-only EC P-256 keypair (PKCS8 private + SPKI public, PEM,
 * JSON-encoded per `JwtKeyPair`) so `AppConfigService` works out of the box
 * in tests/local dev without requiring a generated `.env`. Never used unless
 * `JWT_KEY_CURRENT` is unset — production deployments always set the real
 * env var (generated once, kept secret, rotated via `JWT_KEY_PREVIOUS`).
 */
const DEV_JWT_KEYPAIR_JSON = JSON.stringify({
  kid: "dev-1",
  privateKey:
    "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgdI9fhWXI7I5oHV1m\nb9pZSR/lNqh0QOQ7Vm8mdeeC+hWhRANCAARW1s2AWSA0JEKRGcxYYoxxGIHiDNdw\nEhLgmelH0a6XZQGa/risANStVX4+mOmLmpdPf6AUVCt/9zCd0Vdwo0zh\n-----END PRIVATE KEY-----\n",
  publicKey:
    "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEVtbNgFkgNCRCkRnMWGKMcRiB4gzX\ncBIS4JnpR9Gul2UBmv64rADUrVV+Ppjpi5qXT3+gFFQrf/cwndFXcKNM4Q==\n-----END PUBLIC KEY-----\n",
} satisfies JwtKeyPair);

/** Dev-only 32-byte key, base64-encoded — never used when APP_ENCRYPTION_KEY is set. */
const DEV_ENCRYPTION_KEY_BASE64 = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

/**
 * Module 21 (Licensing) — a REAL Ed25519 keypair, generated once via Node's
 * `crypto.generateKeyPairSync('ed25519')` for this codebase (never used
 * outside dev/test — `INFONEY_LICENSE_PUBLIC_KEY_CURRENT` unset is the only
 * way this default is ever read). The matching private key is intentionally
 * NOT stored anywhere in this codebase (mirrors production reality: only
 * Infoney holds the real private key) — this constant is public-key-only.
 * The REAL Infoney public key gets baked in at build/release time; this is
 * a placeholder so `AppConfigService`/tests work out of the box, same
 * convention as `DEV_JWT_KEYPAIR_JSON` above.
 */
const DEV_INFONEY_PUBLIC_KEY_JSON = JSON.stringify({
  kid: "infoney-dev-1",
  publicKey:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA2NZ7K0k0QqGcxWFLDlNvHd4ea8ipFhBNPx/Jm7cDqpU=\n-----END PUBLIC KEY-----\n",
} satisfies NamedPublicKey);

/**
 * Module 21 (Licensing) — a REAL Ed25519 private key (PKCS8 PEM), generated
 * once for this codebase the same way `DEV_INFONEY_PUBLIC_KEY_JSON` was,
 * backing `instancePrivateKeyPem`'s dev default. Never used when
 * `INSTANCE_PRIVATE_KEY` is set — production deployments always generate
 * and set their own.
 */
const DEV_INSTANCE_PRIVATE_KEY_PEM =
  "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEINKn+pzIm9GA2C88Ikqr1JtS8vqzPfqfvy0iT+LJfEY6\n-----END PRIVATE KEY-----\n";
