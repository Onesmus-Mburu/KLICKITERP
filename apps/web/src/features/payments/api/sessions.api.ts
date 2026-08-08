import type { OpenSessionDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { CashierSession } from "../types";

/**
 * Thin wrapper over `CashierSessionsController`
 * (`packages/server/src/domains/payments/api/cashier-sessions.controller.ts`).
 * Every response is typed as the hand-overridden `CashierSession`
 * (`../types.ts`), never the raw `@klickit/contracts` `CashierSessionResponseDto`
 * — see that file's doc comment for the real `openedAt`/`closedAt`
 * Date-vs-string codegen gap this sidesteps.
 */
export async function openSession(dto: OpenSessionDto): Promise<CashierSession> {
  return unwrapApiResult<CashierSession>(await apiClient.POST("/api/v1/payments/sessions/open", { body: dto }));
}

export interface CloseSessionInput {
  counted: Record<string, string>;
  approval?: { supervisorId: string; varianceReason: string };
}

/**
 * `CloseSessionDto`'s GENERATED OpenAPI type (`packages/contracts/src/generated/openapi-types.ts`)
 * declares `counted: Record<string, never>` — a real, confirmed codegen gap,
 * the same CLASS of issue `lib/api-error.ts`'s `unwrapApiResult<T>` doc
 * comment already documents for nullable Students-domain response fields,
 * just on a REQUEST body here instead of a response: `CloseSessionDto.counted`
 * is declared `@ApiProperty({ type: Object }) counted!: Record<string, string>`
 * server-side (`cashier-session.dto.ts`) — `type: Object` gives Swagger no
 * property-VALUE type to reflect, so `openapi-typescript` emits the
 * unusable empty-object `Record<string, never>` placeholder instead of a
 * real string-valued dictionary. The REAL runtime request body genuinely
 * needs string values (`CashierSessionsService.closeSession()`'s own
 * `counted: Record<string, string>` parameter, confirmed by reading it
 * directly) — this is one documented, narrow cast to the shape the
 * generated client's types (wrongly) expect, not a behavior change; the
 * actual JSON sent over the wire is unaffected.
 */
export async function closeSession(id: string, input: CloseSessionInput): Promise<CashierSession> {
  const body = { counted: input.counted, approval: input.approval } as unknown as {
    counted: Record<string, never>;
    approval?: { supervisorId: string; varianceReason: string };
  };
  return unwrapApiResult<CashierSession>(
    await apiClient.POST("/api/v1/payments/sessions/{id}/close", { params: { path: { id } }, body }),
  );
}

/**
 * `GET /payments/sessions/mine` genuinely returns a real `200` when the
 * calling cashier has no OPEN session (`CashierSessionsController.mine()`:
 * `return session ? toView(session) : null`), NOT a 404 — but a REAL,
 * confirmed runtime finding (empirically verified against the live server,
 * not assumed from the controller's TS signature alone): NestJS does not
 * serialize a `null` return value as the JSON text `"null"`. It sends a
 * genuinely EMPTY body (`Content-Length: 0`, no `Content-Type` header at
 * all) — confirmed via a raw `Invoke-WebRequest` against the live endpoint.
 * `openapi-fetch` cannot parse an empty body as JSON, so it resolves
 * `result.data` to `undefined`, not `null`, on this specific response shape.
 * Left uncorrected, that `undefined` propagates into `useMySession()`'s
 * queryFn return value, which trips TanStack Query's own internal guard
 * against a queryFn resolving to `undefined` (`Error: ["payments","sessions","mine"]
 * data is undefined`, thrown by react-query itself) — surfacing as a false
 * "error" state in `<QueryBoundary>` even though "no session open" is a
 * perfectly valid, expected result, not a failure.
 *
 * Fix: coerce the empty-body `undefined` back to the real `null` this
 * endpoint's own semantics promise, right here at the one call site that
 * knows this endpoint's specific empty-body-means-null contract — not a
 * change to `unwrapApiResult` itself, which dozens of other call sites
 * depend on behaving strictly for shapes that do NOT have this "empty body
 * is a valid, meaningful result" contract.
 */
export async function getMySession(): Promise<CashierSession | null> {
  const data = await unwrapApiResult<CashierSession | undefined>(await apiClient.GET("/api/v1/payments/sessions/mine"));
  return data ?? null;
}
