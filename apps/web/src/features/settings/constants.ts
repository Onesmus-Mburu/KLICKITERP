import type { CustomFieldEntityType, CustomFieldType, IntegrationKind } from "./types";

/** Mirrors `create-integration-config.dto.ts`'s own `INTEGRATION_KINDS` array (server-side) — the real, full enum. Only `MPESA` gets a real form in this pass (Phase 6 Slice 7's plan's own explicit scope) — every other kind still shows a "not yet configurable in this UI" placeholder in `<NewIntegrationDialog>`, never a broken/empty form. */
export const INTEGRATION_KINDS: readonly IntegrationKind[] = ["SMTP", "SMS", "FCM", "MPESA", "QUICKBOOKS", "XERO", "SAGE", "BANK", "WHATSAPP"];

/**
 * Kinds with a real, working config form in this UI. Every other kind in
 * `INTEGRATION_KINDS` renders `<NewIntegrationDialog>`'s explicit placeholder
 * branch instead.
 *
 * Phase 6 Slice 11 Part 4 — `QUICKBOOKS`/`XERO`/`SAGE` join `MPESA` here:
 * `<QuickBooksConfigForm>`/`<XeroConfigForm>`/`<SageConfigForm>` mirror
 * `<MpesaConfigForm>`'s exact shape, matching the real
 * `QuickBooksConfig`/`XeroConfig`/`SageConfig` interfaces confirmed by
 * reading each adapter directly (`../types.ts`'s own doc comments). Both
 * `<NewIntegrationDialog>`/`<EditIntegrationDialog>` now genuinely branch on
 * `kind` to pick the matching form/state/validator, replacing the previous
 * MPESA-only hardcoded path.
 */
export const CONFIGURABLE_INTEGRATION_KINDS: readonly IntegrationKind[] = ["MPESA", "QUICKBOOKS", "XERO", "SAGE"];

/** Mirrors `create-custom-field.dto.ts`'s own `CUSTOM_FIELD_ENTITIES` array (server-side) — the real, full enum. */
export const CUSTOM_FIELD_ENTITIES: readonly CustomFieldEntityType[] = ["STUDENT", "SUPPLIER", "EMPLOYEE", "ASSET"];

/** Mirrors `create-custom-field.dto.ts`'s own `CUSTOM_FIELD_TYPES` array (server-side) — the real, full enum. */
export const CUSTOM_FIELD_TYPES: readonly CustomFieldType[] = ["TEXT", "NUMBER", "DATE", "SELECT"];
