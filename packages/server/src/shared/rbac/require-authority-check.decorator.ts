import { SetMetadata } from "@nestjs/common";

export const AUTHORITY_CHECK_METADATA_KEY = "requireAuthorityCheck";

/**
 * Marks a handler as subject to `AuthorityGuard`'s monetary-limit check
 * (FR-USER-005.1, docs/phase-3/02-communication-authentication.md §2.3).
 * The guard itself is built in the next pass, once `usr_user.authority_limit_amount`
 * has service-layer plumbing to compare against.
 */
export const RequireAuthorityCheck = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORITY_CHECK_METADATA_KEY, true);
