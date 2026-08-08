"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { domains_wallet_wallet_transaction_schema } from "@klickit/contracts";
import {
  adjustWallet,
  closeWallet,
  findWalletByStudent,
  getOrCreateWalletForStudent,
  getWallet,
  listWalletTransactions,
  listWallets,
  refundWallet,
  requestAdjust,
  requestRefund,
  requestTransferToFees,
  requestTransferToWallet,
  setWalletStatus,
  spendWallet,
  topUpWallet,
  transferToFees,
  transferToWallet,
  updateWalletLimits,
  type ListWalletsParams,
  type SetWalletStatusInput,
  type UpdateWalletLimitsInput,
} from "../api/wallets.api";
import {
  WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE,
  WALLET_REFUND_APPROVAL_DOMAIN_CODE,
  WALLET_TRANSFER_APPROVAL_DOMAIN_CODE,
} from "../constants";

type TopUpDto = domains_wallet_wallet_transaction_schema.TopUpDto;
type SpendDto = domains_wallet_wallet_transaction_schema.SpendDto;
type CloseWalletDto = domains_wallet_wallet_transaction_schema.CloseWalletDto;
type TransferToFeesDto = domains_wallet_wallet_transaction_schema.TransferToFeesDto;
type TransferToWalletDto = domains_wallet_wallet_transaction_schema.TransferToWalletDto;
type RefundWalletDto = domains_wallet_wallet_transaction_schema.RefundWalletDto;
type AdjustWalletDto = domains_wallet_wallet_transaction_schema.AdjustWalletDto;

export const WALLETS_QUERY_KEY = ["wallet", "wallets"] as const;

function listKey(params: ListWalletsParams) {
  return [...WALLETS_QUERY_KEY, "list", params] as const;
}
function detailKey(id: string | undefined) {
  return [...WALLETS_QUERY_KEY, "detail", id] as const;
}
function byStudentKey(studentId: string | undefined) {
  return [...WALLETS_QUERY_KEY, "student", studentId] as const;
}
function transactionsKey(id: string | undefined) {
  return [...WALLETS_QUERY_KEY, "transactions", id] as const;
}

/** Phase 6 Slice 11 (Part 2) — the new Wallets list screen. `params` is the whole query key (same convention `useOpenInvoices()`/`useStudents()` already established) — a page/pageSize/q change is a genuinely different query, correctly cache-keyed rather than silently reusing a stale entry. */
export function useWallets(params: ListWalletsParams = {}) {
  return useQuery({
    queryKey: listKey(params),
    queryFn: () => listWallets(params),
  });
}

export function useWallet(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getWallet(id as string),
    enabled: !!id,
  });
}

/** `GET wallets/students/{studentId}` — `null` when the student has no provisioned wallet yet. Used by the student detail page's Wallet card. */
export function useWalletByStudent(studentId: string | undefined) {
  return useQuery({
    queryKey: byStudentKey(studentId),
    queryFn: () => findWalletByStudent(studentId as string),
    enabled: !!studentId,
  });
}

export function useWalletTransactions(id: string | undefined) {
  return useQuery({
    queryKey: transactionsKey(id),
    queryFn: () => listWalletTransactions(id as string),
    enabled: !!id,
  });
}

/** The student detail page's "Create wallet" button — `POST wallets/students/{studentId}` (get-or-create). Invalidates both the by-student lookup and the list, so the new wallet shows up everywhere immediately. */
export function useCreateWalletForStudent(studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getOrCreateWalletForStudent(studentId as string),
    onSuccess: (wallet) => {
      queryClient.invalidateQueries({ queryKey: byStudentKey(studentId) });
      queryClient.invalidateQueries({ queryKey: detailKey(wallet.id) });
      queryClient.invalidateQueries({ queryKey: WALLETS_QUERY_KEY });
    },
  });
}

function invalidateWalletEverywhere(queryClient: ReturnType<typeof useQueryClient>, walletId: string, studentId?: string) {
  queryClient.invalidateQueries({ queryKey: detailKey(walletId) });
  queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) });
  queryClient.invalidateQueries({ queryKey: WALLETS_QUERY_KEY });
  if (studentId) queryClient.invalidateQueries({ queryKey: byStudentKey(studentId) });
}

export function useTopUpWallet(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TopUpDto) => topUpWallet(walletId, dto),
    onSuccess: () => invalidateWalletEverywhere(queryClient, walletId, studentId),
  });
}

export function useSpendWallet(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SpendDto) => spendWallet(walletId, dto),
    onSuccess: () => invalidateWalletEverywhere(queryClient, walletId, studentId),
  });
}

export function useSetWalletStatus(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SetWalletStatusInput) => setWalletStatus(walletId, dto),
    onSuccess: () => invalidateWalletEverywhere(queryClient, walletId, studentId),
  });
}

export function useUpdateWalletLimits(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateWalletLimitsInput) => updateWalletLimits(walletId, dto),
    onSuccess: () => invalidateWalletEverywhere(queryClient, walletId, studentId),
  });
}

export function useCloseWallet(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CloseWalletDto) => closeWallet(walletId, dto),
    onSuccess: () => invalidateWalletEverywhere(queryClient, walletId, studentId),
  });
}

/**
 * Phase 6 Slice 11 (Part 3) — approval-gated transactions. Every REQUEST
 * mutation invalidates its own domain's `["approvals","instances","domain",code]`
 * key (the same literal-key-shape-duplication convention
 * `useReceiptReversalInstance`'s sibling `useRequestReceiptReversal()`
 * already established — see that hook's own doc comment on `domainKey()`),
 * so the wallet detail page's status area picks up the freshly-submitted
 * PENDING instance without a manual refetch. Every EXECUTE mutation
 * invalidates the wallet everywhere PLUS that same domain key (the
 * transaction ledger now carries the `approvalRef`, which is what
 * `useWalletTransferApproval()`/etc.'s `alreadyExecuted` cross-reference
 * needs freshly).
 */
function invalidateApprovalDomain(queryClient: ReturnType<typeof useQueryClient>, domainCode: string) {
  queryClient.invalidateQueries({ queryKey: ["approvals", "instances", "domain", domainCode] });
}

/** `transferToFees()` itself (Slice 8's own wrapper) is untouched — this is just the missing hook wrapper for the wallet detail page's own direct-attempt button, invalidating billing invoices too (P-15 mutates `bill_invoice.paidAmount`/`balance`). */
export function useTransferToFees(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TransferToFeesDto) => transferToFees(walletId, dto),
    onSuccess: () => {
      invalidateWalletEverywhere(queryClient, walletId, studentId);
      invalidateApprovalDomain(queryClient, WALLET_TRANSFER_APPROVAL_DOMAIN_CODE);
      if (studentId) queryClient.invalidateQueries({ queryKey: ["billing", "invoices", "student", studentId] });
    },
  });
}

export function useRequestTransferToFees(walletId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TransferToFeesDto) => requestTransferToFees(walletId, dto),
    onSuccess: () => invalidateApprovalDomain(queryClient, WALLET_TRANSFER_APPROVAL_DOMAIN_CODE),
  });
}

/** `POST :id/transfer-to-wallet` also mutates the COUNTERPARTY wallet's balance/transactions — invalidated too via `dto.toWalletId` (available from the mutation's own variables). */
export function useTransferToWallet(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TransferToWalletDto) => transferToWallet(walletId, dto),
    onSuccess: (_result, dto) => {
      invalidateWalletEverywhere(queryClient, walletId, studentId);
      invalidateWalletEverywhere(queryClient, dto.toWalletId);
      invalidateApprovalDomain(queryClient, WALLET_TRANSFER_APPROVAL_DOMAIN_CODE);
    },
  });
}

export function useRequestTransferToWallet(walletId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TransferToWalletDto) => requestTransferToWallet(walletId, dto),
    onSuccess: () => invalidateApprovalDomain(queryClient, WALLET_TRANSFER_APPROVAL_DOMAIN_CODE),
  });
}

/** ALWAYS approval-gated (FR-WALL-013.1) — no direct-call hook exists here, deliberately; only request + execute. */
export function useRequestRefund(walletId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RefundWalletDto) => requestRefund(walletId, dto),
    onSuccess: () => invalidateApprovalDomain(queryClient, WALLET_REFUND_APPROVAL_DOMAIN_CODE),
  });
}

export function useRefundWallet(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RefundWalletDto) => refundWallet(walletId, dto),
    onSuccess: () => {
      invalidateWalletEverywhere(queryClient, walletId, studentId);
      invalidateApprovalDomain(queryClient, WALLET_REFUND_APPROVAL_DOMAIN_CODE);
    },
  });
}

/** ALWAYS approval-gated (BR-WALL-05) — no direct-call hook exists here, deliberately; only request + execute. */
export function useRequestAdjust(walletId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AdjustWalletDto) => requestAdjust(walletId, dto),
    onSuccess: () => invalidateApprovalDomain(queryClient, WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE),
  });
}

export function useAdjustWallet(walletId: string, studentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AdjustWalletDto) => adjustWallet(walletId, dto),
    onSuccess: () => {
      invalidateWalletEverywhere(queryClient, walletId, studentId);
      invalidateApprovalDomain(queryClient, WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE);
    },
  });
}
