import type { ErrorEnvelope } from "./error-envelope";

/**
 * Thrown by `lib/api-fetch.ts`'s query/mutation functions whenever the API
 * returns a non-2xx response. `status` is the real HTTP status code —
 * `<QueryBoundary>` (`components/patterns/query-boundary.tsx`) keys its
 * "permission-denied" state off `status === 403` specifically, since that's
 * the server's ACTUAL RBAC decision (`AuthorizationException`, code
 * `FORBIDDEN`), not a client-side guess about what the user's role can see.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    try {
      const body = (await response.json()) as ErrorEnvelope;
      return new ApiError(response.status, body.error?.message ?? response.statusText, body.error?.code, body.error?.details);
    } catch {
      return new ApiError(response.status, response.statusText || "Request failed");
    }
  }
}

/** True for a genuine offline/network-level failure (fetch throws before any HTTP response exists) — see `error-envelope.ts`'s ErrorEnvelope for the distinct "server responded with an error body" case `ApiError` covers instead. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError;
}

/**
 * Every dashboard hook calls this on the raw `{ data, error, response }`
 * openapi-fetch result (`apiClient.GET(...)`) instead of hand-checking
 * `.error`/`.response.ok` at each call site. openapi-fetch already parses a
 * non-2xx body for us into `.error` — matched here against the real
 * `ErrorEnvelope` shape every controller in `packages/server` throws
 * (`AllExceptionsFilter`), so `ApiError.status`/`.code` reflect the actual
 * server decision, never guessed.
 *
 * `data` is typed `unknown` here (Phase 6 Slice 2 change, students feature)
 * rather than `T` — a real, confirmed OpenAPI-codegen gap found while
 * binding `features/students/api/*.ts` directly to `@klickit/contracts`'
 * zod-inferred DTO types: several Students-domain response DTOs
 * (`StudentResponseDto`, `GuardianResponseDto`, `FeeGroupResponseDto`, …)
 * use `@ApiPropertyOptional({ nullable: true })` WITHOUT an explicit
 * `type: String` on `string | null` fields (confirmed by reading
 * `student-response.dto.ts` directly) — NestJS/Swagger's reflection can't
 * infer a TS type from a union return type, so the generated OpenAPI schema
 * for those properties has no `type`, and `openapi-typescript` emits an
 * ambiguous `Record<string, never> | null` placeholder instead of
 * `string | null` in `generated/openapi-types.ts`. That placeholder doesn't
 * structurally match `@klickit/contracts`' real `string | null` zod types,
 * which broke `tsc` at every Students `unwrapApiResult<T>(...)` call site
 * even though the ACTUAL runtime JSON is correct (Swagger's `nullable`
 * still round-trips real `null`/string values correctly — this is a
 * TypeScript-level annotation gap, not a runtime bug). Loosening this one
 * shared helper's `data` parameter to `unknown` (callers still supply the
 * real target type via the explicit `<T>` type argument, e.g.
 * `unwrapApiResult<GuardianResponseDto[]>(...)`) fixes every call site with
 * one change instead of a scattered cast per file — a `packages/server`-side
 * fix (adding `type: String` to every affected `@ApiPropertyOptional`) would
 * be the real root-cause fix, but is out of scope for this frontend-only
 * slice (no `packages/server` changes, per the plan's scope boundary).
 * `dashboard/`'s existing call sites are unaffected: they already pass an
 * explicit `<T>` and never relied on this parameter constraining `data`.
 */
interface FieldErrorDetails {
  fields?: { field: string; message: string }[];
}

/**
 * Phase 6 Slice 2b item 2a — parses the structured `{field, message}[]`
 * array `apps/api/src/app.module.ts`'s custom `ValidationPipe`
 * `exceptionFactory` now attaches at `error.details.fields` on every 400
 * validation failure (`AllExceptionsFilter` forwards the whole thrown
 * `BadRequestException` response body verbatim as `error.details` — see
 * that file's own doc comment) into a flat `Record<fieldName, message>` a
 * form can feed straight into `form.setError(field, {message})` per key.
 * When a field has more than one failed constraint, the FIRST message wins
 * (good enough for inline single-line field errors; the full list is still
 * available via `apiError.details` for anyone that wants it).
 *
 * This is a GENERIC fallback, used by every form in the app — it does not
 * replace the already-good, more specific 409-conflict messages
 * (`"already in use"` beats a raw uniqueness constraint sentence) that
 * `student-form.tsx`/`guardian-link-dialog.tsx` already special-case ahead
 * of this; callers should check their own specific cases FIRST and only
 * fall back to `parseFieldErrors` for the generic 400 validation-error case.
 * Returns `{}` (never throws) when `apiError` doesn't carry the expected
 * shape (e.g. a 409/422/500 with a plain string message, or an error from
 * before this pass shipped) — safe to call unconditionally in a `catch`.
 */
export function parseFieldErrors(apiError: ApiError): Record<string, string> {
  const details = apiError.details as FieldErrorDetails | undefined;
  const fields = details?.fields;
  if (!Array.isArray(fields)) return {};

  const result: Record<string, string> = {};
  for (const entry of fields) {
    if (!entry || typeof entry.field !== "string" || typeof entry.message !== "string") continue;
    if (result[entry.field] === undefined) {
      result[entry.field] = entry.message;
    }
  }
  return result;
}

export function unwrapApiResult<T>(result: { data?: unknown; error?: unknown; response: Response }): T {
  if (!result.response.ok) {
    const envelope = result.error as ErrorEnvelope | undefined;
    throw new ApiError(
      result.response.status,
      envelope?.error?.message ?? result.response.statusText ?? "Request failed",
      envelope?.error?.code,
      envelope?.error?.details,
    );
  }
  return result.data as T;
}
