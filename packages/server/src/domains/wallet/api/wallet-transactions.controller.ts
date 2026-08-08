import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ApprovalEngineService } from "../../../platform/approvals";
import { PayReceiptSplitMethod } from "../../payments";
import {
  WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE,
  WALLET_ADJUSTMENT_ENTITY_TYPE,
  WALLET_REFUND_APPROVAL_DOMAIN_CODE,
  WALLET_REFUND_ENTITY_TYPE,
  WALLET_TRANSFER_APPROVAL_DOMAIN_CODE,
  WALLET_TRANSFER_ENTITY_TYPE,
  WalletTransactionsService,
} from "../application/wallet-transactions.service";
import { WallRefundPayoutMethod } from "../application/wallet-control-accounts.util";
import { WallTransactionEntity } from "../domain/wall-transaction.entity";
import { WallTransactionRepository } from "../infrastructure/wall-transaction.repository";
import {
  AdjustWalletDto,
  CloseWalletDto,
  RefundWalletDto,
  SpendDto,
  SweepToInvoicesDto,
  SweepToInvoicesResponseDto,
  TopUpDto,
  TransferToFeesDto,
  TransferToWalletDto,
  TransferToWalletResponseDto,
  WalletApprovalRequestResponseDto,
  WalletTransactionResponseDto,
} from "./dto/wallet-transaction.dto";
import { WalletResponseDto } from "./dto/wallet.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: WallTransactionEntity): WalletTransactionResponseDto {
  return {
    id: entity.id,
    walletId: entity.walletId,
    type: entity.type,
    amount: entity.amount.toDecimalString(),
    direction: entity.direction,
    balanceAfter: entity.balanceAfter.toDecimalString(),
    servicePointId: entity.servicePointId,
    counterpartyWalletId: entity.counterpartyWalletId,
    receiptId: entity.receiptId,
    journalId: entity.journalId,
    approvalRef: entity.approvalRef,
    reasonCode: entity.reasonCode,
    at: entity.at,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`WalletTransactionsController.${action}: no authenticated user on request`);
  return userId;
}

/**
 * `wall_transaction` — the P-13..P-17 posting engine's REST surface.
 * `transferToFees`/`transferToWallet` are threshold-gated (only need the
 * two-step submit/decide/execute dance once the amount exceeds
 * `wallet.transfer_approval_threshold`, checked inside the service itself);
 * `refund`/`adjust` ALWAYS need it (FR-WALL-013.1/BR-WALL-05). All four
 * mirror `ReceiptsController.reverse()`'s exact two-step dance: `POST
 * .../request` submits and returns the instance id, a supervisor decides it
 * via the generic `POST /approvals/instances/:id/decide` (Module 6), then
 * the real mutating endpoint verifies `ApprovalEngineService.getStatus()`
 * before calling into `WalletTransactionsService`.
 */
@ApiTags("wallet-transactions")
@Controller("wallets")
export class WalletTransactionsController {
  constructor(
    private readonly walletTransactionsService: WalletTransactionsService,
    private readonly transactionRepository: WallTransactionRepository,
    private readonly approvalEngineService: ApprovalEngineService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post(":id/topup")
  @RequirePermission("wallet:transaction:topup")
  @ApiOperation({ summary: "P-13 wallet top-up" })
  @ApiResponse({ status: 201, type: WalletTransactionResponseDto })
  async topUp(@Param("id") id: string, @Body() dto: TopUpDto, @Req() req: AuthenticatedRequest): Promise<WalletTransactionResponseDto> {
    const actorId = requireUserId(req, "topUp");
    const txn = await runInTransaction(this.dataSource, (em) =>
      this.walletTransactionsService.topUp(
        em,
        {
          walletId: id,
          amount: Money.fromDecimalString(dto.amount),
          method: dto.method as PayReceiptSplitMethod,
          receiptId: dto.receiptId ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
        actorId,
      ),
    );
    return toView(txn);
  }

  @Post(":id/spend")
  @RequirePermission("wallet:transaction:spend")
  @ApiOperation({ summary: "P-14 wallet spend at a service point (full limit-check gauntlet)" })
  @ApiResponse({ status: 201, type: WalletTransactionResponseDto })
  async spend(@Param("id") id: string, @Body() dto: SpendDto, @Req() req: AuthenticatedRequest): Promise<WalletTransactionResponseDto> {
    const actorId = requireUserId(req, "spend");
    const txn = await runInTransaction(this.dataSource, (em) =>
      this.walletTransactionsService.spend(
        em,
        {
          walletId: id,
          amount: Money.fromDecimalString(dto.amount),
          servicePointId: dto.servicePointId,
          items: dto.items ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
        actorId,
      ),
    );
    return toView(txn);
  }

  @Post(":id/transfer-to-fees/request")
  @RequirePermission("wallet:transaction:transfer")
  @ApiOperation({ summary: "Submit a WALLET_TRANSFER approval instance for a wallet-to-fees transfer (only needed above the threshold)" })
  @ApiResponse({ status: 201, type: WalletApprovalRequestResponseDto })
  async requestTransferToFees(
    @Param("id") id: string,
    @Body() dto: TransferToFeesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletApprovalRequestResponseDto> {
    const initiatorId = requireUserId(req, "requestTransferToFees");
    return runInTransaction(this.dataSource, async (em) => {
      const instance = await this.approvalEngineService.submit(em, {
        domainCode: WALLET_TRANSFER_APPROVAL_DOMAIN_CODE,
        entityType: WALLET_TRANSFER_ENTITY_TYPE,
        entityId: id,
        amount: Money.fromDecimalString(dto.amount),
        initiatorId,
      });
      return { instanceId: instance.id, status: instance.status };
    });
  }

  @Post(":id/transfer-to-fees")
  @RequirePermission("wallet:transaction:transfer")
  @ApiOperation({ summary: "P-15 wallet-to-fees transfer (approvalRef required only above the threshold)" })
  @ApiResponse({ status: 201, type: WalletTransactionResponseDto })
  async transferToFees(
    @Param("id") id: string,
    @Body() dto: TransferToFeesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletTransactionResponseDto> {
    const actorId = requireUserId(req, "transferToFees");
    if (dto.approvalRef) {
      await this.verifyApproved(WALLET_TRANSFER_ENTITY_TYPE, id, dto.approvalRef, "transferToFees");
    }
    const txn = await runInTransaction(this.dataSource, (em) =>
      this.walletTransactionsService.transferToFees(
        em,
        {
          walletId: id,
          amount: Money.fromDecimalString(dto.amount),
          invoiceId: dto.invoiceId,
          approvalRef: dto.approvalRef ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
        actorId,
      ),
    );
    return toView(txn);
  }

  /**
   * Phase 6 Slice 12 (Part A) — P-15 wallet-to-fees sweep across MULTIPLE
   * invoices (given in caller order, typically oldest-due-first), stopping
   * the moment the wallet runs out; posts ONE aggregated journal + ONE
   * `wall_transaction` + a real wallet-funded receipt (see
   * `WalletTransactionsService.sweepToInvoices()`'s own doc comment for the
   * full algorithm). No separate `.../sweep-to-invoices/request` endpoint
   * was added — `dto.approvalRef` verifies against the SAME
   * `WALLET_TRANSFER_ENTITY_TYPE` + this wallet's own id that the
   * pre-existing `.../transfer-to-fees/request` endpoint already knows how
   * to submit an approval instance for (`ApprovalEngineService.getStatus()`
   * resolves the LATEST instance for a given `(entityType, entityId)` pair
   * with no further scoping — a `WALLET_TRANSFER` approval submitted for
   * this wallet is equally valid whether the actual execute call ends up
   * being a single-invoice `transferToFees()` or a multi-invoice
   * `sweepToInvoices()`), so reusing it here is correct, not a shortcut.
   */
  @Post(":id/sweep-to-invoices")
  @RequirePermission("wallet:transaction:transfer")
  @ApiOperation({
    summary:
      "P-15 wallet-to-fees sweep across multiple invoices (caller order), stopping when the wallet runs out; approvalRef required only above the transfer threshold (submit via .../transfer-to-fees/request, same wallet id)",
  })
  @ApiResponse({ status: 201, type: SweepToInvoicesResponseDto })
  async sweepToInvoices(
    @Param("id") id: string,
    @Body() dto: SweepToInvoicesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SweepToInvoicesResponseDto> {
    const actorId = requireUserId(req, "sweepToInvoices");
    if (dto.approvalRef) {
      await this.verifyApproved(WALLET_TRANSFER_ENTITY_TYPE, id, dto.approvalRef, "sweepToInvoices");
    }
    const result = await runInTransaction(this.dataSource, (em) =>
      this.walletTransactionsService.sweepToInvoices(
        em,
        { walletId: id, invoiceIds: dto.invoiceIds, approvalRef: dto.approvalRef ?? null },
        actorId,
      ),
    );
    return {
      totalSwept: result.totalSwept.toDecimalString(),
      allocations: result.allocations.map((alloc) => ({ invoiceId: alloc.invoiceId, amount: alloc.amount.toDecimalString() })),
      receiptId: result.receiptId,
      transactionId: result.transactionId,
      shortfall: result.shortfall.map((s) => ({ invoiceId: s.invoiceId, remainingBalance: s.remainingBalance.toDecimalString() })),
    };
  }

  @Post(":id/transfer-to-wallet/request")
  @RequirePermission("wallet:transaction:transfer")
  @ApiOperation({ summary: "Submit a WALLET_TRANSFER approval instance for a wallet-to-wallet transfer (only needed above the threshold)" })
  @ApiResponse({ status: 201, type: WalletApprovalRequestResponseDto })
  async requestTransferToWallet(
    @Param("id") id: string,
    @Body() dto: TransferToWalletDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletApprovalRequestResponseDto> {
    const initiatorId = requireUserId(req, "requestTransferToWallet");
    return runInTransaction(this.dataSource, async (em) => {
      const instance = await this.approvalEngineService.submit(em, {
        domainCode: WALLET_TRANSFER_APPROVAL_DOMAIN_CODE,
        entityType: WALLET_TRANSFER_ENTITY_TYPE,
        entityId: id,
        amount: Money.fromDecimalString(dto.amount),
        initiatorId,
      });
      return { instanceId: instance.id, status: instance.status };
    });
  }

  @Post(":id/transfer-to-wallet")
  @RequirePermission("wallet:transaction:transfer")
  @ApiOperation({ summary: "P-17 wallet-to-wallet transfer (approvalRef required only above the threshold); locks both wallets in ascending-id order" })
  @ApiResponse({ status: 201, type: TransferToWalletResponseDto })
  async transferToWallet(
    @Param("id") id: string,
    @Body() dto: TransferToWalletDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferToWalletResponseDto> {
    const actorId = requireUserId(req, "transferToWallet");
    if (dto.approvalRef) {
      await this.verifyApproved(WALLET_TRANSFER_ENTITY_TYPE, id, dto.approvalRef, "transferToWallet");
    }
    const result = await runInTransaction(this.dataSource, (em) =>
      this.walletTransactionsService.transferToWallet(
        em,
        {
          fromWalletId: id,
          toWalletId: dto.toWalletId,
          amount: Money.fromDecimalString(dto.amount),
          approvalRef: dto.approvalRef ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
        actorId,
      ),
    );
    return { outTransaction: toView(result.outTransaction), inTransaction: toView(result.inTransaction) };
  }

  @Post(":id/refund/request")
  @RequirePermission("wallet:transaction:refund")
  @ApiOperation({ summary: "Submit a WALLET_REFUND approval instance (FR-WALL-013.1 — every refund needs one)" })
  @ApiResponse({ status: 201, type: WalletApprovalRequestResponseDto })
  async requestRefund(
    @Param("id") id: string,
    @Body() dto: RefundWalletDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletApprovalRequestResponseDto> {
    const initiatorId = requireUserId(req, "requestRefund");
    return runInTransaction(this.dataSource, async (em) => {
      const instance = await this.approvalEngineService.submit(em, {
        domainCode: WALLET_REFUND_APPROVAL_DOMAIN_CODE,
        entityType: WALLET_REFUND_ENTITY_TYPE,
        entityId: id,
        amount: Money.fromDecimalString(dto.amount),
        initiatorId,
      });
      return { instanceId: instance.id, status: instance.status };
    });
  }

  @Post(":id/refund")
  @RequirePermission("wallet:transaction:refund")
  @ApiOperation({ summary: "P-16 wallet refund (BR-WALL-06 payout-target verification; requires an APPROVED WALLET_REFUND instance)" })
  @ApiResponse({ status: 201, type: WalletTransactionResponseDto })
  async refund(@Param("id") id: string, @Body() dto: RefundWalletDto, @Req() req: AuthenticatedRequest): Promise<WalletTransactionResponseDto> {
    const actorId = requireUserId(req, "refund");
    await this.verifyApproved(WALLET_REFUND_ENTITY_TYPE, id, dto.approvalRef, "refund");
    const txn = await runInTransaction(this.dataSource, (em) =>
      this.walletTransactionsService.refund(
        em,
        {
          walletId: id,
          amount: Money.fromDecimalString(dto.amount),
          payoutMethod: dto.payoutMethod as WallRefundPayoutMethod,
          payoutTarget: { guardianId: dto.payoutTarget.guardianId, accountRef: dto.payoutTarget.accountRef ?? null },
          approvalRef: dto.approvalRef,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
        actorId,
      ),
    );
    return toView(txn);
  }

  @Post(":id/adjust/request")
  @RequirePermission("wallet:transaction:adjust")
  @ApiOperation({ summary: "Submit a WALLET_ADJUSTMENT approval instance (BR-WALL-05 — every adjustment needs one)" })
  @ApiResponse({ status: 201, type: WalletApprovalRequestResponseDto })
  async requestAdjust(
    @Param("id") id: string,
    @Body() dto: AdjustWalletDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletApprovalRequestResponseDto> {
    const initiatorId = requireUserId(req, "requestAdjust");
    return runInTransaction(this.dataSource, async (em) => {
      const instance = await this.approvalEngineService.submit(em, {
        domainCode: WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE,
        entityType: WALLET_ADJUSTMENT_ENTITY_TYPE,
        entityId: id,
        amount: Money.fromDecimalString(dto.amount),
        initiatorId,
      });
      return { instanceId: instance.id, status: instance.status };
    });
  }

  @Post(":id/adjust")
  @RequirePermission("wallet:transaction:adjust")
  @ApiOperation({ summary: "BR-WALL-05 manual wallet adjustment (requires an APPROVED WALLET_ADJUSTMENT instance)" })
  @ApiResponse({ status: 201, type: WalletTransactionResponseDto })
  async adjust(@Param("id") id: string, @Body() dto: AdjustWalletDto, @Req() req: AuthenticatedRequest): Promise<WalletTransactionResponseDto> {
    const actorId = requireUserId(req, "adjust");
    await this.verifyApproved(WALLET_ADJUSTMENT_ENTITY_TYPE, id, dto.approvalRef, "adjust");
    const txn = await runInTransaction(this.dataSource, (em) =>
      this.walletTransactionsService.adjust(
        em,
        {
          walletId: id,
          amount: Money.fromDecimalString(dto.amount),
          direction: dto.direction as "D" | "C",
          reasonCode: dto.reasonCode,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
        actorId,
        dto.approvalRef,
      ),
    );
    return toView(txn);
  }

  @Post(":id/close")
  @RequirePermission("wallet:wallet:close")
  @ApiOperation({ summary: "BR-WALL-07 close a wallet (applies the chosen disposition to zero the balance, then flips status=CLOSED)" })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async close(@Param("id") id: string, @Body() dto: CloseWalletDto, @Req() req: AuthenticatedRequest): Promise<WalletResponseDto> {
    const actorId = requireUserId(req, "close");
    const wallet = await runInTransaction(this.dataSource, (em) =>
      this.walletTransactionsService.closeWallet(
        em,
        {
          walletId: id,
          disposition: dto.disposition as "REFUND" | "TRANSFER_TO_SIBLING" | "APPLY_TO_FEES",
          reason: dto.reason ?? null,
          refund: dto.refund
            ? {
                payoutMethod: dto.refund.payoutMethod as WallRefundPayoutMethod,
                payoutTarget: { guardianId: dto.refund.payoutTarget.guardianId, accountRef: dto.refund.payoutTarget.accountRef ?? null },
                approvalRef: dto.refund.approvalRef,
              }
            : undefined,
          transferToSiblingWalletId: dto.transferToSiblingWalletId,
          applyToFeesInvoiceId: dto.applyToFeesInvoiceId,
          approvalRef: dto.approvalRef ?? null,
        },
        actorId,
      ),
    );
    return {
      id: wallet.id,
      studentId: wallet.studentId,
      status: wallet.status,
      balance: wallet.balance.toDecimalString(),
      overdraftLimit: wallet.overdraftLimit.toDecimalString(),
      dailyLimit: wallet.dailyLimit ? wallet.dailyLimit.toDecimalString() : null,
      txnLimit: wallet.txnLimit ? wallet.txnLimit.toDecimalString() : null,
      categoryBlocks: wallet.categoryBlocks,
      statusReason: wallet.statusReason,
    };
  }

  @Get(":id/transactions")
  @RequirePermission("wallet:wallet:view")
  @ApiOperation({ summary: "List a wallet's transactions, newest first" })
  @ApiResponse({ status: 200, type: [WalletTransactionResponseDto] })
  async listTransactions(@Param("id") id: string): Promise<WalletTransactionResponseDto[]> {
    return (await this.transactionRepository.listByWallet(id)).map(toView);
  }

  private async verifyApproved(entityType: string, entityId: string, approvalRef: string, action: string): Promise<void> {
    const instance = await this.approvalEngineService.getStatus(entityType, entityId);
    if (!instance || instance.id !== approvalRef || instance.status !== "APPROVED") {
      throw new ValidationException(
        `WalletTransactionsController.${action}: approvalRef ${approvalRef} is not an APPROVED instance for ${entityType}/${entityId} — ` +
          "submit via the corresponding .../request endpoint and have it decided first",
      );
    }
  }
}
