import type { ApplyStudentCreditDto, ApplyStudentCreditResponseDto, StudentCreditBalanceResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 12 (Part E — Credit Balance Forward frontend). Thin wrapper
 * over the real Credit Balance surface Part D built: a read-only
 * `StudentCreditController` (`domains/billing/api/student-credit.controller.ts`)
 * plus the one write path, `ReceiptsController.applyStudentCredit()`
 * (`domains/payments/api/receipts.controller.ts`) — necessarily split across
 * two domains' controllers because `domains/billing` may not import
 * `domains/payments` (confirmed in `module-deps.json`, per the plan's own
 * "Module boundary" note), so Billing owns the table + the pure read, while
 * Payments' `ReceiptsService` (which already has the receipt/GL machinery)
 * drives the one write. Both DTOs are flatly exported from `@klickit/contracts`
 * (`StudentCreditBalanceResponseDto` from `domains/billing/student-credit.schema.ts`,
 * `ApplyStudentCreditDto`/`ApplyStudentCreditResponseDto` from
 * `domains/payments/receipt.schema.ts` — confirmed via `packages/contracts/src/index.ts`,
 * neither collides with an existing class name the way
 * `wallet-transaction.schema.ts`'s DTOs do, so no namespace import is needed
 * here unlike `wallets.api.ts`).
 *
 * Placed under `features/billing/api/` (not `features/payments/api/`), per
 * the plan's own explicit instruction — this file is the frontend
 * counterpart of the Billing-owned `bill_student_credit` concept, even though
 * one of its two functions calls a Payments-domain route.
 */

/** `GET billing/students/{studentId}/credit-balance` (`billing:invoice:view`) — never 404s; returns `"0.0000"` for a student who's never had a credit balance. Backs the student detail page's new Credit Balance card. */
export async function getStudentCreditBalance(studentId: string): Promise<StudentCreditBalanceResponseDto> {
  return unwrapApiResult<StudentCreditBalanceResponseDto>(
    await apiClient.GET("/api/v1/billing/students/{studentId}/credit-balance", { params: { path: { studentId } } }),
  );
}

/**
 * `POST payments/receipts/apply-student-credit` (`payments:receipt:capture`)
 * — same shape as `sweepToInvoices()` (`features/wallet/api/wallets.api.ts`):
 * applies the student's current Credit Balance across the given,
 * CALLER-ORDERED (oldest-due-first) `invoiceIds` in one call, stopping the
 * moment the balance runs out. Unlike a wallet sweep, there is no separate
 * "does this student have an account" lookup needed first — `studentId` is
 * passed directly, and the balance read above never 404s either. Real
 * differences from `sweepToInvoices()`, confirmed by reading
 * `ReceiptsService.applyStudentCreditToInvoices()` directly (Part D): no
 * approval-threshold gate exists for Credit Balance (no FR-WALL-013.1
 * equivalent), and it never throws an "insufficient balance" error — it
 * simply applies `min(remaining, invoice.balance)` per invoice and reports
 * whatever's left in `shortfall`, the same as an exhausted wallet's
 * `sweepToInvoices()` call already does. `response.receiptId` is `null` only
 * when `totalApplied` is `"0.0000"` (nothing to apply — e.g. zero balance;
 * still a real `201`, not a thrown error).
 */
export async function applyStudentCredit(dto: ApplyStudentCreditDto): Promise<ApplyStudentCreditResponseDto> {
  return unwrapApiResult<ApplyStudentCreditResponseDto>(
    await apiClient.POST("/api/v1/payments/receipts/apply-student-credit", { body: dto }),
  );
}
