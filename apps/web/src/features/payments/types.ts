import type { ChequeResponseDto, CashierSessionResponseDto, SuspenseItemResponseDto } from "@klickit/contracts";

/**
 * Phase 6 Slice 4 — a real, confirmed codegen gap, the same CLASS of issue
 * `features/billing/types.ts` already documents for the academic-year/term
 * endpoints, but narrower and subtler: `CashierSessionResponseDto`
 * (`packages/server/src/domains/payments/api/dto/cashier-session.dto.ts`)
 * genuinely HAS a decorated `@ApiResponse({ type: CashierSessionResponseDto })`
 * and a real generated zod schema
 * (`packages/contracts/src/domains/payments/cashier-session.schema.ts`) — but
 * that schema declares `openedAt: z.coerce.date()` /
 * `closedAt: z.coerce.date().nullable()`, mirroring the real DTO's
 * `openedAt!: Date` / `closedAt!: Date | null` TS field types 1:1. That makes
 * `z.infer<typeof CashierSessionResponseDtoSchema>` (the type
 * `@klickit/contracts` exports) type BOTH fields as `Date`.
 *
 * Nest actually serializes a `Date`-typed response field as a plain ISO
 * string over JSON, and `lib/api-error.ts`'s `unwrapApiResult<T>()` never
 * calls `.parse()` on the zod schema — confirmed by reading it directly: it's
 * a plain `result.data as T` cast on the raw `fetch` JSON, nothing coerces
 * anything. So the REAL runtime value of `session.openedAt` is a STRING, even
 * though its declared TS type says `Date`. Calling a `Date` method directly
 * on the typed field (e.g. `session.openedAt.toLocaleString()`) would
 * type-check cleanly but throw at runtime
 * (`TypeError: session.openedAt.toLocaleString is not a function`).
 *
 * `CashierSession` here overrides just those two fields to `string`/
 * `string | null` to match the REAL wire shape — every function/component in
 * `features/payments/` imports THIS type, never `CashierSessionResponseDto`
 * directly, and does `new Date(session.openedAt)` at the one or two call
 * sites that actually need a real `Date` object (see
 * `components/session-status-widget.tsx`/`app/(erp)/payments/page.tsx`) —
 * never a bare `.` method call on the field itself. A `packages/server`-side
 * fix (typing those two DTO fields `string` to begin with, matching e.g.
 * `receipt.dto.ts`'s `receiptDate!: string`) would be the real root-cause
 * fix, but is out of scope for this frontend-only slice.
 */
export type CashierSession = Omit<CashierSessionResponseDto, "openedAt" | "closedAt"> & {
  openedAt: string;
  closedAt: string | null;
};

/**
 * Phase 6 Slice 6 — the SAME `Date`-vs-string codegen-gap override
 * `CashierSession` above already establishes, for `ChequeResponseDto.statusChangedAt`
 * (`cheque.schema.ts` declares `z.coerce.date().nullable()`, mirroring
 * `PayChequeEntity.statusChangedAt!: Date | null` 1:1 — but `unwrapApiResult()`
 * never parses, so the real wire value is a string or `null`). Every
 * cheques component imports THIS type, never `ChequeResponseDto` directly.
 */
export type Cheque = Omit<ChequeResponseDto, "statusChangedAt"> & {
  statusChangedAt: string | null;
};

/**
 * Phase 6 Slice 6 — the SAME codegen-gap override, for
 * `SuspenseItemResponseDto.receivedAt`/`.resolvedAt`
 * (`suspense.schema.ts` declares `z.coerce.date()`/`z.coerce.date().nullable()`,
 * mirroring `PaySuspenseItemEntity`'s `Date`-typed fields 1:1). Every
 * suspense component imports THIS type, never `SuspenseItemResponseDto`
 * directly.
 */
export type SuspenseItem = Omit<SuspenseItemResponseDto, "receivedAt" | "resolvedAt"> & {
  receivedAt: string;
  resolvedAt: string | null;
};
