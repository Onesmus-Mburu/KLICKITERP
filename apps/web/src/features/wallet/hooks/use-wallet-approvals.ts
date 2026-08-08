"use client";

import * as React from "react";
import { useInstancesForDomain } from "@/features/approvals/hooks/use-instances";
import type { Instance } from "@/features/approvals/types";
import { pickLatestInstanceForEntity } from "../lib/approval-instance";
import {
  WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE,
  WALLET_REFUND_APPROVAL_DOMAIN_CODE,
  WALLET_TRANSFER_APPROVAL_DOMAIN_CODE,
} from "../constants";
import { useWalletTransactions } from "./use-wallets";

/**
 * Mirrors `features/payments/hooks/use-receipts.ts`'s
 * `useReceiptReversalInstance()` shape exactly — resolves "is there a
 * pending/approved/decided approval instance for THIS wallet's transfer (or
 * refund, or adjustment)" by fetching every instance for the relevant domain
 * code (`useInstancesForDomain()`, Slice 5's own engine-level hook) and
 * picking the latest one whose `entityId` matches this wallet.
 *
 * `alreadyExecuted` is a genuinely new addition beyond the reversal
 * precedent: `appr_instance` has NO "consumed"/"used" flag anywhere
 * (confirmed by reading `appr-instance.entity.ts`/`approval-engine.service.ts`
 * directly — an APPROVED instance stays APPROVED forever, and nothing marks
 * it spent once its `approvalRef` is actually used to post a transaction).
 * Unlike a receipt reversal (whose OWN row flips `POSTED`->`REVERSED`, a
 * clear "already used" signal), a wallet transfer/refund/adjustment has no
 * such self-referential flag either — so this hook cross-references the
 * wallet's own transaction ledger (`useWalletTransactions()`, already fetched
 * by the detail page) for a `wall_transaction` row whose `approvalRef`
 * equals the latest instance's id. If one exists, the approval was already
 * spent — the UI hides the "Complete" action and shows a completed state
 * instead of inviting a second, genuinely-possible-but-wrong re-execution
 * against the same already-approved instance (the backend itself places no
 * limit on how many times an `approvalRef` can be reused, a real, honestly
 * flagged gap — see this dispatch's PROGRESS.md section).
 */
function useWalletApprovalInstance(walletId: string | undefined, domainCode: string) {
  const domainQuery = useInstancesForDomain(walletId ? domainCode : undefined);
  const transactionsQuery = useWalletTransactions(walletId);

  const latestInstance = React.useMemo(() => {
    if (!walletId || !domainQuery.data) return undefined;
    return pickLatestInstanceForEntity(domainQuery.data as Instance[], walletId);
  }, [domainQuery.data, walletId]);

  const alreadyExecuted = React.useMemo(() => {
    if (!latestInstance || !transactionsQuery.data) return false;
    return transactionsQuery.data.some((txn) => txn.approvalRef === latestInstance.id);
  }, [latestInstance, transactionsQuery.data]);

  return { ...domainQuery, latestInstance, alreadyExecuted };
}

export function useWalletTransferApproval(walletId: string | undefined) {
  return useWalletApprovalInstance(walletId, WALLET_TRANSFER_APPROVAL_DOMAIN_CODE);
}

export function useWalletRefundApproval(walletId: string | undefined) {
  return useWalletApprovalInstance(walletId, WALLET_REFUND_APPROVAL_DOMAIN_CODE);
}

export function useWalletAdjustmentApproval(walletId: string | undefined) {
  return useWalletApprovalInstance(walletId, WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE);
}
