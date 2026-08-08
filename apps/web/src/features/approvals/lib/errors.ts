import { ApiError } from "@/lib/api-error";

/**
 * `ApprovalEngineService.decide()` — a real `ValidationException` (422, code
 * `VALIDATION_ERROR`) thrown when REJECT/RETURN is submitted with no
 * comment, message containing the stable `FR-APPR-003.1` marker (confirmed
 * by reading `approval-engine.service.ts`'s `decide()` directly). The client
 * already blocks this case before ever making the request
 * (`DecideButtons`'s own comment-required check) — this matcher exists so a
 * bypassed/raw call still surfaces a recognizable error, not a generic one.
 */
export function isCommentRequiredError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 422 && /FR-APPR-003\.1/.test(err.message);
}

/**
 * `ApprovalEngineService.decide()` — a real `AuthorizationException` (403,
 * code `FORBIDDEN`) thrown when `actorId === instance.initiatorId` (directly)
 * OR the legitimate approver whose authority is being exercised is the
 * initiator (via delegation/role overlap), message containing the stable
 * `BR-APPR-01` marker. `DecideButtons` disables the Approve/Reject/Return
 * buttons client-side for the DIRECT case (an obvious, cheap UX nicety since
 * `currentUserId` is already known from the auth store) — this matcher
 * covers the deeper delegation/role-overlap case the client can't predict in
 * advance, so a real 403 there still surfaces a recognizable, honest message
 * instead of the generic fallback.
 */
export function isSelfApprovalError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 403 && /BR-APPR-01/.test(err.message);
}
