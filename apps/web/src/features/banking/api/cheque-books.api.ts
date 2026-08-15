import type { BankChequeBookResponseDto, CreateChequeBookDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — thin wrapper over `ChequeBooksController`
 * (`packages/server/src/domains/banking/api/cheque-books.controller.ts`, base
 * `/api/v1/banking/cheque-books`, tag `banking-cheque-books`). A SINGLE
 * shared `banking:cheque-book:manage` permission gates all 3 routes,
 * including LIST (confirmed by reading the controller directly, 55 lines) —
 * the same "one shared manage-shaped permission covers list/get too" shape
 * every other Banking sub-domain in this feature folder already established.
 * Only 3 routes exist — `create`/`list`/`findOne` — no `update`/`delete`,
 * confirmed directly, matching this part's own task brief; no edit/delete UI
 * is built for cheque books.
 *
 * **`CreateChequeBookDto`/`BankChequeBookResponseDto` both generate CLEANLY
 * against `packages/contracts/src/generated/openapi-types.ts` — zero gap on
 * either side, no cast needed anywhere in this file.** Checked directly:
 * `cheque-book.dto.ts`'s 4 fields (`accountId`/`prefix`/`startLeaf`/
 * `endLeaf`) are all plain required scalars — none optional, none nullable —
 * so there is nothing for NestJS/Swagger's reflection to degrade. The
 * response dto is equally plain (5 required scalars, no nullable field at
 * all). The zod-inferred `@klickit/contracts` types agree byte-for-byte. The
 * same "generates cleanly" story `CreateBankTransferDto` (Part 2) and all 4
 * of Reconciliation's own request DTOs (Part 4) already told.
 *
 * **The auto-generated leaf range is NOT returned by `create()`** —
 * `BankChequeBookResponseDto` carries only the book's own 5 fields
 * (`id`/`accountId`/`prefix`/`startLeaf`/`endLeaf`), never the leaves
 * themselves (confirmed by reading `ChequeBooksController.toView()`
 * directly). The caller must follow up with a separate
 * `listChequeLeaves({ bookId })` call (`cheque-leaves.api.ts`) to see the
 * real generated rows — `create-cheque-book-dialog.tsx` does exactly this,
 * navigating to the new book's own detail page after creation rather than
 * trying to render leaves from the create response.
 *
 * **One standing query-param gap, the usual class**:
 * `ChequeBooksController_list`'s generated query-param type requires
 * `accountId` as a plain (non-optional) `string` even though the real
 * controller (`@Query("accountId") accountId?: string`) treats it as
 * genuinely optional. Fixed the same conditional-query-object way every
 * prior `*.api.ts` file in this codebase already establishes.
 *
 * No schema-name collision — `CreateChequeBookDto`/`BankChequeBookResponseDto`
 * are both globally unique names in `openapi-types.ts`, confirmed by grep
 * before writing this file.
 */
interface ChequeBooksListQueryShape {
  accountId?: string;
}

export interface ListChequeBooksFilters {
  accountId?: string;
}

export async function listChequeBooks(filters: ListChequeBooksFilters = {}): Promise<BankChequeBookResponseDto[]> {
  const query: ChequeBooksListQueryShape = {};
  if (filters.accountId !== undefined) query.accountId = filters.accountId;
  return unwrapApiResult<BankChequeBookResponseDto[]>(
    await apiClient.GET("/api/v1/banking/cheque-books", { params: { query: query as unknown as Required<ChequeBooksListQueryShape> } }),
  );
}

export async function getChequeBook(id: string): Promise<BankChequeBookResponseDto> {
  return unwrapApiResult<BankChequeBookResponseDto>(
    await apiClient.GET("/api/v1/banking/cheque-books/{id}", { params: { path: { id } } }),
  );
}

/** FR-BANK-005.1 — auto-generates one UNUSED `bank_cheque_leaf` per leaf number in `[startLeaf, endLeaf]`, inside the same transaction as this one call. `ck_bank_cheque_book_leaf_range` (`endLeaf >= startLeaf`) is enforced server-side (a real 422 surfaced verbatim if violated) — `create-cheque-book-dialog.tsx` also pre-validates it client-side as a UX nicety, not the real enforcement. */
export async function createChequeBook(dto: CreateChequeBookDto): Promise<BankChequeBookResponseDto> {
  return unwrapApiResult<BankChequeBookResponseDto>(await apiClient.POST("/api/v1/banking/cheque-books", { body: dto }));
}
