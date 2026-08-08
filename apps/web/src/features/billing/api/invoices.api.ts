import type {
  GenerateInvoiceDto,
  InvoiceLineResponseDto,
  InvoiceResponseDto,
  PendingUpcomingInvoiceListResponseDto,
  VoidInvoiceDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/**
 * Thin wrapper over `InvoicesController`
 * (`packages/server/src/domains/billing/api/invoices.controller.ts`).
 * Permissions: `billing:invoice:generate`/`:post`/`:void`/`:view`.
 *
 * Two real, distinct error shapes callers should check for BEFORE falling
 * back to a generic message (see `../lib/errors.ts`):
 *  - `generate()` — a real `409 Conflict` (`ConflictException`, code
 *    `CONFLICT`) when a STRUCTURE invoice already exists for this
 *    student+term+structure (BR-BILL-04) — confirmed by reading
 *    `InvoicingService.generateInvoice()`'s unique-violation catch block.
 *  - `post()` — a real `404` (`NotFoundException`, code `NOT_FOUND`) when
 *    a required GL control account (e.g. `AR_STUDENT`) isn't configured —
 *    confirmed by reading `resolveControlAccount()`
 *    (`packages/server/src/domains/billing/application/gl-control-accounts.util.ts`).
 */
export async function generateInvoice(dto: GenerateInvoiceDto): Promise<InvoiceResponseDto> {
  return unwrapApiResult<InvoiceResponseDto>(await apiClient.POST("/api/v1/billing/invoices/generate", { body: dto }));
}

export async function postInvoice(id: string): Promise<InvoiceResponseDto> {
  return unwrapApiResult<InvoiceResponseDto>(
    await apiClient.POST("/api/v1/billing/invoices/{id}/post", { params: { path: { id } } }),
  );
}

export async function voidInvoice(id: string, dto: VoidInvoiceDto): Promise<InvoiceResponseDto> {
  return unwrapApiResult<InvoiceResponseDto>(
    await apiClient.POST("/api/v1/billing/invoices/{id}/void", { params: { path: { id } }, body: dto }),
  );
}

export async function listInvoicesForStudent(studentId: string): Promise<InvoiceResponseDto[]> {
  return unwrapApiResult<InvoiceResponseDto[]>(
    await apiClient.GET("/api/v1/billing/invoices", { params: { query: { studentId } } }),
  );
}

export async function getInvoice(id: string): Promise<InvoiceResponseDto> {
  return unwrapApiResult<InvoiceResponseDto>(await apiClient.GET("/api/v1/billing/invoices/{id}", { params: { path: { id } } }));
}

export async function listInvoiceLines(id: string): Promise<InvoiceLineResponseDto[]> {
  return unwrapApiResult<InvoiceLineResponseDto[]>(
    await apiClient.GET("/api/v1/billing/invoices/{id}/lines", { params: { path: { id } } }),
  );
}

/**
 * Phase 6 Slice 8 (Part 2) — Pending/Upcoming invoice list screens.
 * `InvoicesController_pending`/`_upcoming`'s generated query-param type
 * declares `query?: never` (the SAME `@Query() pagination: PaginationQueryDto`
 * object-param codegen gap `optionalQuery()`'s own doc comment already
 * describes for `classId`/`streamId`/`status`/`page`/`pageSize` elsewhere in
 * this app — confirmed again here, not assumed) — `optionalQuery()`'s return
 * type isn't tied to the endpoint's declared query shape, so passing
 * `page`/`pageSize`/`asOfDate` still type-checks and the real backend
 * genuinely reads them.
 */
export interface ListOpenInvoicesParams {
  page?: number;
  pageSize?: number;
  /** ISO date string override for "today" — omitted in every real caller so far; the backend defaults to the real server date. */
  asOfDate?: string;
  /** Phase 6 Slice 9 (Part B) — ILIKE match against the joined student's name or admission number; omitted (not sent) below 2 characters by the caller (`OpenInvoicesTable`'s own gating), per the plan's explicit "only fire once 2+ characters are typed" ask. */
  q?: string;
}

export async function listPendingInvoices(params: ListOpenInvoicesParams = {}): Promise<PendingUpcomingInvoiceListResponseDto> {
  return unwrapApiResult<PendingUpcomingInvoiceListResponseDto>(
    await apiClient.GET("/api/v1/billing/invoices/pending", {
      params: {
        query: optionalQuery({
          page: params.page !== undefined ? String(params.page) : undefined,
          pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
          asOfDate: params.asOfDate,
          q: params.q,
        }),
      },
    }),
  );
}

export async function listUpcomingInvoices(params: ListOpenInvoicesParams = {}): Promise<PendingUpcomingInvoiceListResponseDto> {
  return unwrapApiResult<PendingUpcomingInvoiceListResponseDto>(
    await apiClient.GET("/api/v1/billing/invoices/upcoming", {
      params: {
        query: optionalQuery({
          page: params.page !== undefined ? String(params.page) : undefined,
          pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
          asOfDate: params.asOfDate,
          q: params.q,
        }),
      },
    }),
  );
}
