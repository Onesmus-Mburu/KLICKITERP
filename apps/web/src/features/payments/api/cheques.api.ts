import type { BounceChequeDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { Cheque } from "../types";

/**
 * Thin wrapper over `ChequesController`
 * (`packages/server/src/domains/payments/api/cheques.controller.ts`).
 * Permission: `payments:cheque:manage` covers every handler here (list,
 * detail, clear, bounce — confirmed by reading the controller directly).
 *
 * `listUnclearedCheques()` is genuinely a QUEUE view, not a full history —
 * `GET /payments/cheques` only ever returns `UNCLEARED` rows (confirmed by
 * reading `ChequesService.listUncleared()`); there is no separate
 * cleared/bounced history endpoint. `getCheque()` (`GET .../{id}`) is the one
 * way to look up a specific cheque once it has left that list.
 */
export async function listUnclearedCheques(): Promise<Cheque[]> {
  return unwrapApiResult<Cheque[]>(await apiClient.GET("/api/v1/payments/cheques"));
}

export async function getCheque(id: string): Promise<Cheque> {
  return unwrapApiResult<Cheque>(await apiClient.GET("/api/v1/payments/cheques/{id}", { params: { path: { id } } }));
}

/** `POST .../{id}/clear` — no body; a trivial `UNCLEARED -> CLEARED` status flip (confirmed by reading `ChequesService.clear()`). */
export async function clearCheque(id: string): Promise<Cheque> {
  return unwrapApiResult<Cheque>(await apiClient.POST("/api/v1/payments/cheques/{id}/clear", { params: { path: { id } } }));
}

/**
 * `POST .../{id}/bounce` (`{applyBounceFee?}`) — bypasses Approvals entirely
 * (confirmed by reading `ChequesController.bounce()`/`ChequesService.bounce()`
 * directly: a single direct action, no request/decide two-step). The bounce
 * FEE AMOUNT is entirely server-controlled (a Settings key,
 * `CHEQUE_BOUNCE_FEE_AMOUNT_SETTING_KEY`, defaulting to `500.00` KES) — this
 * wrapper's `dto` only ever carries the boolean toggle, never an amount.
 *
 * **A real, confirmed OpenAPI-codegen gap**, the same CLASS of issue
 * `sessions.api.ts`'s `closeSession()` already documents: `BounceChequeDto`'s
 * GENERATED type (`openapi-types.ts`) declares `applyBounceFee: boolean`
 * (REQUIRED) even though the real server-side DTO has it
 * `@ApiPropertyOptional()` + `applyBounceFee?: boolean` (`cheque.dto.ts`) —
 * `@nestjs/swagger`'s combination of `@ApiPropertyOptional()` with a
 * `@default` annotation apparently still emits a required Swagger property
 * here. One documented, narrow cast to the shape the generated client's
 * types (wrongly) expect — the actual JSON sent over the wire (including a
 * genuinely omitted `applyBounceFee`) is unaffected.
 */
export async function bounceCheque(id: string, dto: BounceChequeDto): Promise<Cheque> {
  const body = dto as unknown as { applyBounceFee: boolean };
  return unwrapApiResult<Cheque>(
    await apiClient.POST("/api/v1/payments/cheques/{id}/bounce", { params: { path: { id } }, body }),
  );
}
