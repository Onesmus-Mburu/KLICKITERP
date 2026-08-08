"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money";
import { useReceipt } from "@/features/payments/hooks/use-receipts";
import { useSuspenseItem } from "@/features/payments/hooks/use-suspense";
import { useWallet } from "@/features/wallet/hooks/use-wallets";
import { useStudent } from "@/features/students/hooks/use-students";

/**
 * The real gap the plan flagged: `InstanceResponseDto` has zero
 * human-readable context — just `{id, workflowVersionId, domainCode,
 * entityType, entityId, amount, initiatorId, status, currentLevel,
 * submittedAt, decidedAt}` (confirmed by reading `instance-response.dto.ts`
 * directly). This component is the resolver: given `(entityType, entityId)`,
 * render something a human can actually recognize instead of a raw UUID.
 *
 * **Why this design is extensible, not a one-off**: adding a new resolvable
 * entity type is exactly one more `entityType === "..."` branch, each
 * calling that domain's OWN already-existing detail hook, conditionally
 * enabled by the entity-type match (`useReceipt(isReceipt ? entityId :
 * undefined)`) — the identical `enabled: !!id`-style pattern every hook in
 * this app already follows, so the hook is always called (satisfying
 * rules-of-hooks) but only ever fetches for the entity type it owns. No
 * plugin registry/dynamic hook-dispatch mechanism was built for this — this
 * codebase's own established preference is direct, readable code over
 * abstraction (see `receipts.api.ts`'s "two separate wrapper functions...
 * keeps that real constraint visible" doc comment for the same philosophy).
 *
 * Phase 6 Slice 6 adds the SECOND frontend-resolvable entity type,
 * `pay_suspense_item` (suspense refund approvals) — the exact extension
 * point this doc comment already named as the intended shape, closed by the
 * new `GET /payments/suspense/:id` backend endpoint this slice also adds
 * (suspense items otherwise only exist on the OPEN-only list, which can't
 * resolve an already-MATCHED/REFUNDED item an approval instance might
 * reference).
 *
 * Phase 6 Slice 11 (Part 3) adds THREE more: `wall_wallet_transfer`/
 * `wall_wallet_refund`/`wall_wallet_adjustment` — mirrors `pay_suspense_item`'s
 * own extension exactly, except `entity_id` for all three is the WALLET id,
 * not a transaction id (confirmed by reading `WalletTransactionsController`'s
 * `request*()` handlers directly: `entityId: id` where `id` is the `:id`
 * wallet path param — the underlying wall_transaction doesn't exist yet at
 * SUBMIT time, only once the approval is later executed). `GET
 * /wallets/{id}` alone has no joined student name, so this resolver chains
 * through a SECOND existing hook (`useStudent(wallet.studentId)`,
 * `features/students`) rather than needing a new backend endpoint — the same
 * "resolve through already-existing domain hooks, no new endpoint" shape
 * this component's own doc comment already commits to, just one hop deeper.
 *
 * The generic fallback below (raw entity type + a truncated id, never a
 * crash) is what every one of the OTHER 13 real domain codes this engine
 * already serves gets today (Billing concessions/credit-notes/
 * refund-vouchers/late-fee-batches, GL budgets, Procurement requisitions/
 * POs/supplier-payments, Inventory stock adjustments, Expenses vouchers/
 * replenishments/claims, Payroll loans/runs, Banking transfers/deposits/
 * withdrawals, Fixed Assets depreciation/disposals/verifications —
 * confirmed via the `0900` seed migration's `SINGLE_LEVEL_WORKFLOW_SEEDS`
 * array) — none of those have a frontend screen to link to yet, so a
 * resolved label isn't possible for them regardless; the fallback degrades
 * honestly instead of guessing a route that doesn't exist.
 */
export function EntityLabel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const t = useTranslations("approvals.entity");
  const isReceipt = entityType === "pay_receipt";
  const isSuspenseItem = entityType === "pay_suspense_item";
  const isWalletTransfer = entityType === "wall_wallet_transfer";
  const isWalletRefund = entityType === "wall_wallet_refund";
  const isWalletAdjustment = entityType === "wall_wallet_adjustment";
  const isWalletEntity = isWalletTransfer || isWalletRefund || isWalletAdjustment;
  const receiptQuery = useReceipt(isReceipt ? entityId : undefined);
  const suspenseItemQuery = useSuspenseItem(isSuspenseItem ? entityId : undefined);
  const walletQuery = useWallet(isWalletEntity ? entityId : undefined);
  const walletStudentQuery = useStudent(isWalletEntity ? walletQuery.data?.studentId : undefined);

  function fallback() {
    return (
      <span className="text-muted-foreground">
        {t("genericFallback", { entityType, shortId: entityId.slice(0, 8) })}
      </span>
    );
  }

  if (isReceipt) {
    if (receiptQuery.isLoading) {
      return <span className="text-muted-foreground">{t("loading")}</span>;
    }
    if (receiptQuery.isError || !receiptQuery.data) {
      // Never crash/block the row — degrade to the same generic fallback a
      // genuinely-unresolvable entity type gets, per the plan's own instruction.
      return fallback();
    }
    const receipt = receiptQuery.data;
    return (
      <Link href={`/payments/receipts/${entityId}`} className="text-primary hover:underline">
        {t("receiptLabel", { number: receipt.number, payer: receipt.payerName, amount: formatMoney(receipt.total) })}
      </Link>
    );
  }

  if (isSuspenseItem) {
    if (suspenseItemQuery.isLoading) {
      return <span className="text-muted-foreground">{t("loading")}</span>;
    }
    if (suspenseItemQuery.isError || !suspenseItemQuery.data) {
      return fallback();
    }
    const item = suspenseItemQuery.data;
    return (
      <Link href={`/payments/suspense/${entityId}`} className="text-primary hover:underline">
        {t("suspenseLabel", { source: item.source, externalRef: item.externalRef, amount: formatMoney(item.amount) })}
      </Link>
    );
  }

  if (isWalletEntity) {
    if (walletQuery.isLoading || (!!walletQuery.data && walletStudentQuery.isLoading)) {
      return <span className="text-muted-foreground">{t("loading")}</span>;
    }
    if (walletQuery.isError || !walletQuery.data || walletStudentQuery.isError || !walletStudentQuery.data) {
      return fallback();
    }
    const wallet = walletQuery.data;
    const student = walletStudentQuery.data;
    const labelKey = isWalletTransfer ? "walletTransferLabel" : isWalletRefund ? "walletRefundLabel" : "walletAdjustmentLabel";
    return (
      <Link href={`/wallet/${entityId}`} className="text-primary hover:underline">
        {t(labelKey, {
          studentName: `${student.firstName} ${student.lastName}`,
          admissionNo: student.admissionNo,
          balance: formatMoney(wallet.balance),
        })}
      </Link>
    );
  }

  return fallback();
}
