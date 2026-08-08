import createClient, { type Client, type ClientOptions, type Middleware } from "openapi-fetch";
import type { paths } from "./generated/openapi-types";

/**
 * Thin typed HTTP client over the full Klickit Finance ERP REST surface
 * (509 routes at last regeneration — see openapi.json / generate:types).
 * `openapi-fetch` (the companion library to `openapi-typescript`, the tool
 * that produced ./generated/openapi-types.ts) is used deliberately instead of
 * a hand-rolled fetch wrapper: it is a ~1kb runtime with zero dependencies
 * that turns the generated `paths` type into full request/response type
 * inference (method, path params, query params, request body, response body
 * all statically checked against the OpenAPI document), which is exactly the
 * "typed client paired with the generated types" this package exists to
 * provide — see docs/phase-3/01-system-architecture.md §4.3: "feature API
 * clients are generated from packages/contracts (OpenAPI -> typed client) so
 * frontend/backend drift is a build failure."
 */
export type ApiClient = Client<paths>;

export type { Middleware };

/**
 * `baseUrl` should point at the API's `/api/v1` prefix (see
 * `apps/api/src/main.api.ts`'s global prefix), e.g.
 * `createApiClient({ baseUrl: "http://localhost:3000/api/v1" })`.
 * Auth: attach a `Middleware` (openapi-fetch's own extension point) to set
 * `Authorization: Bearer <token>` per request — deliberately not baked into
 * this factory, since token storage/refresh is a frontend (apps/web)
 * concern, not a contracts-package concern.
 */
export function createApiClient(options: ClientOptions): ApiClient {
  return createClient<paths>(options);
}
