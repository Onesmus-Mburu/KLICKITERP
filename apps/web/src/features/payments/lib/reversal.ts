import type { Instance } from "@/features/approvals/types";

/**
 * No server endpoint filters `GET /approvals/instances?domainCode=` by
 * `entityId` (confirmed by reading `instances.controller.ts`'s `list()`
 * directly — only `status`/`domainCode` query params exist), so a receipt's
 * reversal status is resolved by fetching every `PAYMENT_REVERSALS` instance
 * and picking the matching row(s) here. Mirrors
 * `ApprovalEngineService.getStatus()`'s own real "most recent instance for
 * the entity" semantics EXACTLY — that method's `findLatestByEntity()`
 * (`appr-instance.repository.ts`) does `ORDER BY submitted_at DESC LIMIT 1`;
 * this does the equivalent client-side (max `submittedAt`) — so the frontend
 * never disagrees with what `POST .../reverse`'s own server-side
 * `approvalRef` re-verification will accept as "the current instance".
 */
export function pickLatestInstanceForEntity(instances: Instance[], entityId: string): Instance | null {
  const matches = instances.filter((instance) => instance.entityId === entityId);
  if (matches.length === 0) return null;
  return matches.reduce((latest, current) =>
    new Date(current.submittedAt).getTime() > new Date(latest.submittedAt).getTime() ? current : latest,
  );
}
