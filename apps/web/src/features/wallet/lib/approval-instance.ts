import type { Instance } from "@/features/approvals/types";

/**
 * Duplicates `features/payments/lib/reversal.ts`'s `pickLatestInstanceForEntity()`
 * byte-for-byte (same reasoning `features/wallet/api/query-params.ts`'s own
 * doc comment gives for duplicating `optionalQuery()` rather than importing
 * cross-feature: keeps each feature module's own folder self-contained,
 * matching this monorepo's `features/<module>/{api,hooks,components,lib}`
 * convention). No server endpoint filters `GET /approvals/instances?domainCode=`
 * by `entityId` (confirmed by reading `instances.controller.ts`'s `list()`
 * directly — only `status`/`domainCode` query params exist), so a wallet's
 * transfer/refund/adjustment approval status is resolved by fetching every
 * instance for the relevant domain code and picking the matching row here.
 * Mirrors `ApprovalEngineService.getStatus()`'s own real "most recent
 * instance for the entity" semantics exactly (`ORDER BY submitted_at DESC
 * LIMIT 1`) — the frontend never disagrees with what the real
 * execute-endpoint's own server-side `approvalRef` re-verification accepts
 * as "the current instance".
 */
export function pickLatestInstanceForEntity(instances: Instance[], entityId: string): Instance | null {
  const matches = instances.filter((instance) => instance.entityId === entityId);
  if (matches.length === 0) return null;
  return matches.reduce((latest, current) =>
    new Date(current.submittedAt).getTime() > new Date(latest.submittedAt).getTime() ? current : latest,
  );
}
