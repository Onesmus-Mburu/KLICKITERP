import type { IssueStockDto, MovementResponseDto as GeneratedMovementResponseDto, StockBalanceResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — thin
 * wrapper over `StockMovementsController`
 * (`packages/server/src/domains/inventory/api/stock-movements.controller.ts`,
 * base `/api/v1/inventory/stock-movements`) — read-only balance/history views
 * (`inventory:movement:view`) plus the ONE write route, `issue()`
 * (`inventory:movement:issue`). **`recordReceipt`/`recordSale`/`recordReturn`
 * exist as internal `StockMovementsService` methods with NO controller route
 * at all** (confirmed by reading the controller directly, 100 lines, exactly
 * 4 routes: `balance`/`balances`/`history`/`issue`) — there is genuinely no
 * way to manually "receive" stock through this screen; `RECEIPT`/`SALE`/
 * `RETURN` movement rows only ever originate from other modules (Procurement
 * goods-receipt, POS/Billing sales, returns processing), never from this UI.
 *
 * `IssueStockDto`/`MovementResponseDto`/`StockBalanceResponseDto`
 * (`packages/contracts/src/domains/inventory/stock-movement.schema.ts`) have
 * NO class-name collision anywhere else in `packages/server/src`
 * (grep-confirmed against `class IssueStockDto|class MovementResponseDto|class
 * StockBalanceResponseDto`, exactly one hit each) and are flatly exported
 * from `@klickit/contracts`'s root barrel — no namespace workaround needed,
 * same as `stores.api.ts`/`items.api.ts`.
 *
 * **A genuinely NEW class of codegen gap, beyond every nullable-field/
 * required-query-param finding Part 1 documented** — `MovementResponseDtoSchema`
 * (the REAL, zod-inferred contracts schema) declares `at: z.coerce.date()`,
 * which infers a TypeScript `Date` for `MovementResponseDto.at`. But
 * `unwrapApiResult()` (`lib/api-error.ts`) performs NO runtime zod
 * validation/parsing at all — it is a pure `data as T` type assertion (see
 * that file's own doc comment) — and a `Date` object never actually crosses
 * the wire: `JSON.stringify()` always serializes a `Date` to an ISO string,
 * and the real, running `MovementResponseDto.at!: Date` class field
 * (`stock-movement.dto.ts`) round-trips through NestJS's JSON serializer the
 * same way. **The real runtime value of `at` is always a plain ISO
 * date-time STRING, never an actual `Date` instance** — confirmed by reading
 * `packages/contracts/src/generated/openapi-types.ts`'s own OpenAPI-derived
 * shape for this exact field (`/** Format: date-time *\/ at: string;`), which
 * (unlike the zod mirror) correctly reflects what `@nestjs/swagger` observed
 * on the wire. The local `Movement` type below overrides `at: string` to be
 * honest about the real runtime shape — every caller in this feature treats
 * `at` as a string and wraps it in `new Date(movement.at)` before formatting,
 * the same pattern `features/integrations/components/sync-log-table.tsx`
 * already established for its own (differently-typed, but analogously
 * wire-vs-declared-type mismatched) timestamp column.
 *
 * **`getBalance()`'s "no balance row exists yet" `null` return has the exact
 * same zero-byte-body gotcha `items.api.ts`'s own `findItemByBarcode()`
 * already documents and fixes** — confirmed by reading
 * `StockMovementsController.getBalance()` directly (`return balance ?
 * toBalanceView(balance) : null`), the identical "NestJS treats a returned JS
 * `null` as `undefined` for response purposes, so the wire body is genuinely
 * 0 bytes" mechanics. `getStockBalance()` below applies the same `?? null`
 * coercion at this one call site.
 *
 * Query-param gaps are the now-familiar class: every GET's `itemId`/`storeId`
 * query param is generated as a required (non-optional) `string`, even though
 * this feature always supplies real values for them anyway (unlike
 * Categories/Items' own OPTIONAL query params) — no conditional-query-object
 * workaround is needed here since every param this file's functions accept is
 * genuinely required by the real controller too (`@Query("itemId") itemId:
 * string`, no `?`, confirmed by reading the controller directly).
 *
 * `IssueStockDto.departmentId` gains a generated `| null` the real zod type
 * doesn't have (`string | undefined`) — but `string | undefined` IS a
 * subtype of `string | null | undefined`, so (unlike `items.api.ts`'s
 * `uomConversions` gap, where the real type was NOT a subtype of the
 * generated one) this direction needs NO cast at the `apiClient.POST`
 * boundary — confirmed by a real `tsc --noEmit` pass with no cast present.
 */

interface BalanceQueryShape {
  itemId: string;
  storeId: string;
}

interface BalancesQueryShape {
  storeId: string;
}

/** See this file's own doc comment above — `at` is honestly `string` here, never the zod-inferred (but never actually true at runtime) `Date`. */
export type Movement = Omit<GeneratedMovementResponseDto, "at"> & { at: string };

export type { StockBalanceResponseDto };

/** Real `null` (not a 404) when no balance row exists yet for this (item, store) pair — see this file's own doc comment. */
export async function getStockBalance(itemId: string, storeId: string): Promise<StockBalanceResponseDto | null> {
  const query: BalanceQueryShape = { itemId, storeId };
  const result = await apiClient.GET("/api/v1/inventory/stock-movements/balance", { params: { query } });
  return unwrapApiResult<StockBalanceResponseDto | undefined>(result) ?? null;
}

/** Every balance row at one store — the source for a store-wide stock position view. */
export async function listStockBalances(storeId: string): Promise<StockBalanceResponseDto[]> {
  const query: BalancesQueryShape = { storeId };
  return unwrapApiResult<StockBalanceResponseDto[]>(
    await apiClient.GET("/api/v1/inventory/stock-movements/balances", { params: { query } }),
  );
}

/** Most-recent-first movement ledger for one (item, store) pair — shows all 7 `movementType` values even though only `ISSUE` is creatable from this feature (Transfers/Stock Takes create the rest). */
export async function listMovementHistory(itemId: string, storeId: string): Promise<Movement[]> {
  const query: BalanceQueryShape = { itemId, storeId };
  return unwrapApiResult<Movement[]>(
    await apiClient.GET("/api/v1/inventory/stock-movements/history", { params: { query } }),
  );
}

export interface IssueStockInput {
  itemId: string;
  storeId: string;
  /** Decimal string, scale 4, positive (server-enforced via `qtyIsPositive`). */
  qty: string;
  departmentId?: string;
}

/**
 * The ONLY write route on this controller (FR-INV-003.1, manual
 * department-consumption ISSUE). `refDocType`/`refDocId` are always omitted
 * here — the server defaults `refDocType` to `"MANUAL_ISSUE"` and generates a
 * fresh `refDocId` when either is absent (`StockMovementsController.issue()`'s
 * own `dto.refDocType ?? DEFAULT_MANUAL_ISSUE_REF_DOC_TYPE` / `dto.refDocId ??
 * generateUuidV7()`), so this form never needs to surface either field.
 *
 * **BR-INV-03 freeze**: issuing stock for an item currently inside an
 * OPEN/COUNTING/REVIEW/PENDING_APPROVAL stock-take's scope at that store 422s
 * — the real server message is surfaced verbatim by the caller's own
 * `ApiError` catch block, never genericized (Stock Takes doesn't exist yet as
 * of this part, so this path is documented but not live-exercisable yet).
 */
export async function issueStock(input: IssueStockInput): Promise<Movement> {
  const dto: IssueStockDto = {
    itemId: input.itemId,
    storeId: input.storeId,
    qty: input.qty,
    ...(input.departmentId ? { departmentId: input.departmentId } : {}),
  };
  return unwrapApiResult<Movement>(await apiClient.POST("/api/v1/inventory/stock-movements/issue", { body: dto }));
}
