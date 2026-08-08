/**
 * Phase 6 Slice 7 — the first Settings-area frontend module. Hand-typed,
 * the SAME class of gap `features/approvals/types.ts`'s `UserSummary` and
 * `features/billing/types.ts`'s `AcademicYearResponse`/`TermResponse`
 * already document: `IntegrationConfigsController`'s `create()`/`list()`/
 * `findOne()`/`update()`/`testConnection()` handlers all have ZERO
 * `@ApiResponse({ type })` decorators (confirmed by reading
 * `integration-configs.controller.ts` directly), so `@nestjs/swagger`
 * recorded no response schema for any of them — confirmed in
 * `packages/contracts/src/generated/openapi-types.ts`:
 * `IntegrationConfigsController_list`/`_create`/`_findOne`/`_update`/
 * `_testConnection` all declare `responses: { <status>: { ..., content?: never } }`.
 *
 * Unlike `UserSummary` (deliberately partial — the real entity carries
 * secret columns this app has no reason to reference), `IntegrationConfig`
 * here mirrors the controller's own real `toView()` mapper's output shape
 * IN FULL (`configEnc` is the ONE field `toView()` itself strips — see that
 * function's own doc comment, "Never serialize config_enc... over HTTP" —
 * so there is nothing secret left to omit here). `createdAt`/`updatedAt`/
 * `lastTestedAt` are typed `string`/`string | null` (the real wire shape,
 * Nest serializes a `Date` field as a plain ISO string) rather than `Date`,
 * the SAME `Date`-vs-string precedent `features/payments/types.ts`'s
 * `CashierSession` and `features/approvals/types.ts`'s `Instance` already
 * establish for an analogous reason (here there isn't even a generated zod
 * schema declaring `Date` to diverge from — this is hand-typed from
 * scratch — but the real wire shape is identical: a plain ISO string).
 *
 * A `packages/server`-side fix (a real `IntegrationConfigResponseDto` with
 * `@ApiResponse({type})` decorators on every handler, mirroring
 * `receipt.dto.ts`'s own `toView()` pattern) would be the real root-cause
 * fix, but is out of scope for this pass (the plan's own explicit
 * instruction: no new backend DTO/entity/wiring for the credential
 * storage/consumption itself — only the one `testConnection()` fix).
 */
export interface IntegrationConfig {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
  kind: IntegrationKind;
  name: string;
  isEnabled: boolean;
  priority: number;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

/** Mirrors `SetIntegrationKind` (`packages/server/.../set-integration-config.entity.ts`) — hand-duplicated as a plain string union, the same convention `features/payments/constants.ts`'s `RECEIPT_SPLIT_METHODS` already establishes for a server-owned enum with no generated-type equivalent worth depending on. */
export type IntegrationKind = "SMTP" | "SMS" | "FCM" | "MPESA" | "QUICKBOOKS" | "XERO" | "SAGE" | "BANK" | "WHATSAPP";

/** `IntegrationConfigService.testConnection()`'s real return shape (`TestConnectionResult`) — also has no `@ApiResponse({type})`, same gap as above. */
export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * The exact real field names `MpesaAdapterResolverService`'s `DarajaConfig`
 * interface declares (`packages/server/src/domains/payments/infrastructure/adapters/daraja.adapter.ts`)
 * — this is the `config` payload shape a `kind:"MPESA"` integration config's
 * `POST`/`PATCH` body must send. Hand-typed here rather than imported from
 * `packages/server` (a frontend package can never import server-internal
 * code) — the ONE other place this exact shape is documented is that
 * adapter's own doc comment, cross-referenced here so the two can't silently
 * drift without a human noticing.
 */
export interface MpesaConfig {
  environment: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackBaseUrl: string;
  initiatorName?: string;
  securityCredential?: string;
  b2cShortcode?: string;
  timeoutMs?: number;
}

/**
 * Phase 6 Slice 11 Part 4 — the exact real field names `QuickBooksAdapter`'s
 * `QuickBooksConfig` interface declares
 * (`packages/server/src/domains/integrations/infrastructure/adapters/quickbooks.adapter.ts`),
 * confirmed by reading that adapter file directly — same hand-typed-from-
 * the-adapter's-own-interface convention `MpesaConfig` above already
 * establishes (a frontend package can never import server-internal code).
 * `environment`/`clientId`/`clientSecret`/`refreshToken`/`realmId` are the
 * real required fields; `minorVersion`/`timeoutMs` are genuinely optional.
 */
export interface QuickBooksConfig {
  environment: "sandbox" | "production";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  realmId: string;
  minorVersion?: string;
  timeoutMs?: number;
}

/** Mirrors `XeroAdapter`'s `XeroConfig` interface (`.../adapters/xero.adapter.ts`) — same convention as `QuickBooksConfig` above. `timeoutMs` is the only optional field. */
export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tenantId: string;
  timeoutMs?: number;
}

/** Mirrors `SageAdapter`'s `SageConfig` interface (`.../adapters/sage.adapter.ts`) — same convention as `QuickBooksConfig`/`XeroConfig` above. `timeoutMs` is the only optional field. */
export interface SageConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  timeoutMs?: number;
}

/**
 * Phase 6 Slice 11 Part 1 — hand-mirrored response shapes for
 * `AcademicCalendarController`'s `/academic-years` and `/terms` endpoints
 * (`packages/server/src/platform/settings/api/academic-calendar.controller.ts`).
 * Same class of gap `features/billing/types.ts`'s own
 * `AcademicYearResponse`/`TermResponse` already documents (and this is a
 * byte-for-byte duplicate of those two interfaces): every handler on that
 * controller returns the raw TypeORM entity with NO `@ApiResponse({type})`
 * decorator, so `@nestjs/swagger` recorded no response schema — confirmed in
 * `packages/contracts/src/generated/openapi-types.ts`
 * (`AcademicCalendarController_listYears`/`_updateYear`/etc. all declare
 * `content?: never`). Duplicated here rather than imported from
 * `features/billing/types` — same "each feature module's folder stays
 * self-contained" convention `features/billing/api/query-params.ts`'s own
 * doc comment establishes for the analogous `optionalQuery()` helper.
 */
export interface AcademicYearResponse {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

export interface TermResponse {
  id: string;
  academicYearId: string;
  name: string;
  seq: number;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  billingLocked: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

/**
 * Mirrors `SetNumberingResetPolicy`
 * (`packages/server/.../set-numbering-series.entity.ts`) — hand-duplicated
 * string union, same convention `IntegrationKind` above already establishes
 * for a server-owned enum with no generated-type equivalent worth depending
 * on.
 */
export type NumberingResetPolicy = "NEVER" | "YEARLY" | "TERMLY";

/**
 * `NumberingController`'s handlers (`list`/`findOne`/`preview`) all have the
 * same zero-`@ApiResponse({type})` gap as `AcademicCalendarController` above
 * — hand-mirrored from `SetNumberingSeriesEntity` directly. `nextNo` is a
 * `bigint` column, represented as a decimal string on the wire (this
 * codebase's established convention for bigint columns, per that entity's
 * own doc comment).
 */
export interface NumberingSeriesResponse {
  id: string;
  docType: string;
  seriesCode: string;
  prefix: string;
  padWidth: number;
  resetPolicy: NumberingResetPolicy;
  periodKey: string;
  nextNo: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

/** `NumberingController.preview()`'s real return shape: `{ series: id, next: string[] }` (see that handler directly — it's a plain object literal, not a DTO class). */
export interface NumberingPreviewResponse {
  series: string;
  next: string[];
}

/** Mirrors `SetCustomFieldEntityType`/`SetCustomFieldType` (`packages/server/.../set-custom-field-def.entity.ts`) — hand-duplicated string unions, same convention as `IntegrationKind`/`NumberingResetPolicy` above. */
export type CustomFieldEntityType = "STUDENT" | "SUPPLIER" | "EMPLOYEE" | "ASSET";
export type CustomFieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT";

/** `CustomFieldsController`'s handlers have the same zero-`@ApiResponse({type})` gap as the other two controllers above — hand-mirrored from `SetCustomFieldDefEntity` directly. `options` is genuinely unvalidated JSON server-side (`jsonb`, nullable) — typed `unknown` here, never assumed to be any particular shape beyond what this app's own forms choose to write into it. */
export interface CustomFieldDefResponse {
  id: string;
  entity: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: unknown | null;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}
