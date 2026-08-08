/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `platform/approvals`'
 * `mayImport` is `["shared", "platform/users"]` (module-deps.json), so this
 * is a structurally-typed duplicate of the guard's output shape, not a
 * cross-module import. Mirrors `platform/comms`/`platform/settings`/
 * `platform/branding`'s `api/request-context.ts`.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

/** `WorkflowVersionsService`/`0900` seed's system role name — see `InstancesController.cancel()`'s doc comment for why a role-name check stands in for `cancel()`'s "admin permission" clause. */
export const SYSTEM_ADMIN_ROLE_NAME = "System Admin";
