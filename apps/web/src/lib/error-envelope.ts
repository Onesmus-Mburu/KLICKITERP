/** Mirrors `packages/server/src/shared/exceptions/error-envelope.ts` exactly (FR-API-005.1) — the shape of every non-2xx API response body. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id: string;
}
