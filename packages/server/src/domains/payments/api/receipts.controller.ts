import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiExtraModels, ApiOperation, ApiQuery, ApiResponse, ApiTags, getSchemaPath } from "@nestjs/swagger";
import type { Redis } from "ioredis";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { PaginationQueryDto } from "../../../shared/pagination/pagination.dto";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { AuthorizationException } from "../../../shared/exceptions/authorization.exception";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { ApprovalEngineService } from "../../../platform/approvals";
import { resolveGrantedPermissions } from "../../../platform/auth";
// Barrel import of an application-layer repository (not an entity-decorator
// target) — same precedent `AllocationService` (`application/allocation.service.ts`)
// already established for this exact cross-domain read: `BillInvoiceRepository`
// is already exported from `domains/billing`'s public barrel, and
// `domains/payments`' `mayImport` list already includes `domains/billing`.
import { BillInvoiceRepository } from "../../billing";
// Phase 6 Slice 16 (Part 1) — barrel import, same one-directional-dependency
// shape as every other cross-module service call in this controller above.
import { DocumentVerificationService } from "../../../platform/document-verification";
import {
  PAYMENT_RECEIPT_DOCUMENT_TYPE,
  PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE,
  ReceiptsService,
} from "../application/receipts.service";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptAllocationEntity } from "../domain/pay-receipt-allocation.entity";
import { PayReceiptSplitEntity } from "../domain/pay-receipt-split.entity";
import { PAY_RECEIPT_SPLIT_METHODS, PayReceiptSplitMethod } from "../domain/pay-receipt-split.entity";
import { PayReceiptAllocationRepository } from "../infrastructure/pay-receipt-allocation.repository";
import { PayReceiptRepository } from "../infrastructure/pay-receipt.repository";
import { PayReceiptSplitRepository } from "../infrastructure/pay-receipt-split.repository";
import {
  ApplyStudentCreditDto,
  ApplyStudentCreditResponseDto,
  CaptureReceiptDto,
  ReceiptAllocationResponseDto,
  ReceiptDetailResponseDto,
  ReceiptListItemResponseDto,
  ReceiptListResponseDto,
  ReceiptResponseDto,
  ReceiptSplitResponseDto,
  ReverseReceiptDto,
  ReversalApprovalResponseDto,
} from "./dto/receipt.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PayReceiptEntity): ReceiptResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    studentId: entity.studentId,
    payerName: entity.payerName,
    payerPhone: entity.payerPhone,
    receiptDate: entity.receiptDate,
    total: entity.total.toDecimalString(),
    status: entity.status,
    reversalOfId: entity.reversalOfId,
    reversalReason: entity.reversalReason,
    approvalRef: entity.approvalRef,
    cashierId: entity.cashierId,
    sessionId: entity.sessionId,
    journalId: entity.journalId,
    idempotencyKey: entity.idempotencyKey,
    balanceAfter: entity.balanceAfter.toDecimalString(),
    reprintCount: entity.reprintCount,
  };
}

function toSplitView(entity: PayReceiptSplitEntity): ReceiptSplitResponseDto {
  return {
    id: entity.id,
    receiptId: entity.receiptId,
    method: entity.method,
    amount: entity.amount.toDecimalString(),
    bankAccountId: entity.bankAccountId,
    chequeId: entity.chequeId,
    mpesaTransactionId: entity.mpesaTransactionId,
    externalRef: entity.externalRef,
  };
}

/**
 * Phase 6 Slice 8 (Part 4) — the global (unscoped) Receipts list row shape.
 * `entity.student`/`entity.cashier` are populated by
 * `PayReceiptRepository.findAllPaginated()`'s `leftJoinAndSelect()`s — same
 * "joined-in-the-same-query, not a per-row lookup" shape
 * `InvoicesController.toPendingUpcomingView()` already established for
 * `PendingUpcomingInvoiceResponseDto`, including its empty-string fallback
 * (never expected to trigger for a real NOT NULL `student_id`/`cashier_id`
 * FK, but defensive rather than a possible-undefined property access).
 */
function toReceiptListItemView(entity: PayReceiptEntity): ReceiptListItemResponseDto {
  const student = entity.student;
  return {
    ...toView(entity),
    studentName: student ? `${student.firstName}${student.middleName ? ` ${student.middleName}` : ""} ${student.lastName}` : "",
    cashierName: entity.cashier?.fullName ?? "",
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`ReceiptsController.${action}: no authenticated user on request`);
  return userId;
}

const RECEIPT_ENTITY_TYPE = "pay_receipt";
/** Phase 6 Slice 8 (Part 4) — gates `list()`'s new unscoped branch; see that method's own doc comment. */
const RECEIPT_VIEW_ALL_PERMISSION_CODE = "payments:receipt:view-all";

/**
 * `pay_receipt` — the core payment-capture document (BR-PAY-01/03/04/08).
 * `POST .../reverse` requires a pre-approved `PAYMENT_REVERSALS`
 * `appr_instance` — the two-step dance is `POST .../reverse/request`
 * (submits, returns the instance id) -> a supervisor decides it via the
 * generic `POST /approvals/instances/:id/decide` (Module 6) -> `POST
 * .../reverse` with that instance's id as `approvalRef`, verified here
 * (`ApprovalEngineService.getStatus()`) before `ReceiptsService.reverseReceipt()`
 * runs. This mirrors `domains/billing`'s `ConcessionsService.requestConcession()`
 * (submits) vs `.postStandalone()` (assumes already-approved) split, moved to
 * the controller layer here since `ReceiptsService.reverseReceipt()`'s own
 * signature deliberately never calls `ApprovalEngineService` itself (see that
 * method's doc comment).
 */
@ApiTags("payments-receipts")
@Controller("payments/receipts")
export class ReceiptsController {
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly receiptRepository: PayReceiptRepository,
    private readonly splitRepository: PayReceiptSplitRepository,
    private readonly allocationRepository: PayReceiptAllocationRepository,
    private readonly approvalEngineService: ApprovalEngineService,
    private readonly invoiceRepository: BillInvoiceRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    // Phase 6 Slice 16 (Part 1) — appended at the end, same discipline every
    // prior constructor extension in this codebase follows.
    private readonly documentVerificationService: DocumentVerificationService,
  ) {}

  @Post()
  @RequirePermission("payments:receipt:capture")
  @ApiOperation({ summary: "Capture a (possibly split-method) receipt against a student, allocating BR-PAY-02/03 and posting P-08/P-09" })
  @ApiResponse({ status: 201, type: ReceiptResponseDto })
  async capture(@Body() dto: CaptureReceiptDto, @Req() req: AuthenticatedRequest): Promise<ReceiptResponseDto> {
    const cashierId = requireUserId(req, "capture");
    const receipt = await runInTransaction(this.dataSource, (em) =>
      this.receiptsService.captureReceipt(em, {
        studentId: dto.studentId,
        payerName: dto.payerName,
        payerPhone: dto.payerPhone ?? null,
        receiptDate: dto.receiptDate,
        total: Money.fromDecimalString(dto.total),
        splits: dto.splits.map((split) => ({
          method: split.method,
          amount: Money.fromDecimalString(split.amount),
          bankAccountId: split.bankAccountId ?? null,
          externalRef: split.externalRef ?? null,
          chequeDetails: split.chequeDetails,
          mpesaTransactionId: split.mpesaTransactionId ?? null,
        })),
        cashierId,
        sessionId: dto.sessionId ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
        invoiceIds: dto.invoiceIds,
      }),
    );
    return toView(receipt);
  }

  /**
   * Phase 6 Slice 12 (Part D — Credit Balance Forward). Same general shape
   * as `WalletTransactionsController.sweepToInvoices()` — a real
   * multi-invoice, caller-ordered sweep, this time against the student's
   * `bill_student_credit` balance instead of a wallet. `payments:receipt:capture`
   * (an existing permission — no new code minted) is the closest fit: this
   * call creates a real `pay_receipt`, the exact same action that
   * permission already gates on the `POST /payments/receipts` endpoint
   * above.
   */
  @Post("apply-student-credit")
  @RequirePermission("payments:receipt:capture")
  @ApiOperation({
    summary:
      "P-10: apply a student's Credit Balance across multiple invoices (caller order), stopping when the balance runs out — posts a real new GL journal",
  })
  @ApiResponse({ status: 201, type: ApplyStudentCreditResponseDto })
  async applyStudentCredit(@Body() dto: ApplyStudentCreditDto, @Req() req: AuthenticatedRequest): Promise<ApplyStudentCreditResponseDto> {
    const actorId = requireUserId(req, "applyStudentCredit");
    const result = await runInTransaction(this.dataSource, (em) =>
      this.receiptsService.applyStudentCreditToInvoices(em, { studentId: dto.studentId, invoiceIds: dto.invoiceIds }, actorId),
    );
    return {
      totalApplied: result.totalApplied.toDecimalString(),
      allocations: result.allocations.map((alloc) => ({ invoiceId: alloc.invoiceId, amount: alloc.amount.toDecimalString() })),
      receiptId: result.receiptId,
      shortfall: result.shortfall.map((s) => ({ invoiceId: s.invoiceId, remainingBalance: s.remainingBalance.toDecimalString() })),
    };
  }

  /**
   * Phase 6 Slice 8 (Part 4) — a THIRD mode added on top of the original two
   * (`studentId` given / `sessionId` given, both completely unchanged below):
   * when NEITHER is given, this now returns a paginated, filterable, global
   * (cross-student) receipts list instead of throwing — but ONLY for a
   * caller holding `payments:receipt:view-all`, checked BY HAND (the exact
   * same dynamic `resolveGrantedPermissions()` pattern
   * `ReportsController.execute()` already established, `platform/auth/
   * application/permission-check.util.ts`'s own doc comment) rather than a
   * second static `@RequirePermission`, since a route only carries ONE static
   * required-permission code and this route's base `payments:receipt:view`
   * must stay sufficient — unmodified — for the `studentId`/`sessionId`
   * branches. `payments:receipt:view` ALONE is deliberately NOT enough for
   * this third branch: seeing every family's payment history unscoped is a
   * real privacy escalation over viewing one already-identified student's
   * receipts (the plan's own explicit judgement call), so it requires the
   * separately-granted `payments:receipt:view-all`.
   */
  @Get()
  @RequirePermission("payments:receipt:view")
  @ApiOperation({
    summary:
      "List receipts: studentId or sessionId (exactly one) for a scoped list (unchanged), or neither " +
      "(requires payments:receipt:view-all) for a global paginated/filterable list",
  })
  @ApiQuery({ name: "studentId", required: false })
  @ApiQuery({ name: "sessionId", required: false })
  @ApiQuery({ name: "cashierId", required: false, description: "Global-list mode only" })
  @ApiQuery({ name: "dateFrom", required: false, description: "Global-list mode only — ISO date, inclusive lower bound on receiptDate" })
  @ApiQuery({ name: "dateTo", required: false, description: "Global-list mode only — ISO date, inclusive upper bound on receiptDate" })
  @ApiQuery({ name: "method", required: false, enum: PAY_RECEIPT_SPLIT_METHODS, description: "Global-list mode only" })
  @ApiQuery({
    name: "q",
    required: false,
    description: "Global-list mode only — Phase 6 Slice 9 — ILIKE match against the joined student's name or admission number",
  })
  @ApiExtraModels(ReceiptListResponseDto)
  @ApiResponse({
    status: 200,
    schema: {
      oneOf: [{ type: "array", items: { $ref: getSchemaPath(ReceiptResponseDto) } }, { $ref: getSchemaPath(ReceiptListResponseDto) }],
    },
  })
  async list(
    @Query() pagination: PaginationQueryDto,
    @Query("studentId") studentId: string | undefined,
    @Query("sessionId") sessionId: string | undefined,
    @Query("cashierId") cashierId: string | undefined,
    @Query("dateFrom") dateFrom: string | undefined,
    @Query("dateTo") dateTo: string | undefined,
    @Query("method") method: string | undefined,
    @Query("q") q: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReceiptResponseDto[] | ReceiptListResponseDto> {
    if (studentId) return (await this.receiptRepository.listByStudent(studentId)).map(toView);
    if (sessionId) return (await this.receiptRepository.listBySession(sessionId)).map(toView);

    const user = req.user;
    if (!user) throw new AuthenticationException("Authentication required");
    const granted = await resolveGrantedPermissions(user, this.redis);
    if (!granted.includes(RECEIPT_VIEW_ALL_PERMISSION_CODE)) {
      throw new AuthorizationException(`Missing required permission "${RECEIPT_VIEW_ALL_PERMISSION_CODE}"`);
    }

    if (method !== undefined && !PAY_RECEIPT_SPLIT_METHODS.includes(method as PayReceiptSplitMethod)) {
      throw new ValidationException(`ReceiptsController.list: "${method}" is not a valid payment method`);
    }

    const { items, total } = await this.receiptRepository.findAllPaginated(
      {
        cashierId: cashierId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        method: (method as PayReceiptSplitMethod) || undefined,
        q: q || undefined,
      },
      { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize },
    );
    return { items: items.map(toReceiptListItemView), total };
  }

  @Get(":id")
  @RequirePermission("payments:receipt:view")
  @ApiOperation({ summary: "Get a receipt by id, including its splits and allocations" })
  @ApiResponse({ status: 200, type: ReceiptDetailResponseDto })
  async findOne(@Param("id") id: string): Promise<ReceiptDetailResponseDto> {
    const receipt = await this.receiptRepository.findByIdOrFail(id);
    const [splits, allocations, verification] = await Promise.all([
      this.splitRepository.listByReceipt(id),
      this.allocationRepository.listByReceipt(id),
      // Phase 6 Slice 16 (Part 1) — resolved only on this "get by id" path
      // (not on `list()`), avoiding an N+1 lookup per row in the receipts
      // list. `null` for a receipt that predates this feature.
      this.documentVerificationService.findByDocument(PAYMENT_RECEIPT_DOCUMENT_TYPE, id),
    ]);
    const allocationViews = await Promise.all(allocations.map((allocation) => this.toAllocationView(allocation)));
    return {
      ...toView(receipt),
      splits: splits.map(toSplitView),
      allocations: allocationViews,
      verificationToken: verification?.token ?? null,
    };
  }

  /**
   * Phase 6 Slice 8 (Part 4) — resolves the real invoice `number` (e.g.
   * `BIL-000047`) for a non-null `invoiceId`, via
   * `BillInvoiceRepository.findByIdOrFail()`. A receipt has at most a
   * handful of allocations, so this small N-lookup (one query per
   * non-prepayment allocation row) is fine — same precedent
   * `domains/reporting`'s aging report already uses for a comparable small
   * per-row resolve. Always `null` for a `toPrepayment:true` row, which
   * carries no `invoiceId` to resolve.
   */
  private async toAllocationView(entity: PayReceiptAllocationEntity): Promise<ReceiptAllocationResponseDto> {
    const invoiceNumber = entity.invoiceId ? (await this.invoiceRepository.findByIdOrFail(entity.invoiceId)).number : null;
    return {
      id: entity.id,
      receiptId: entity.receiptId,
      invoiceId: entity.invoiceId,
      installmentId: entity.installmentId,
      toPrepayment: entity.toPrepayment,
      amount: entity.amount.toDecimalString(),
      invoiceNumber,
    };
  }

  @Post(":id/reverse/request")
  @RequirePermission("payments:receipt:reverse")
  @ApiOperation({ summary: "Submit a PAYMENT_REVERSALS approval instance for this receipt (BR-PAY-08 step 1 of 2)" })
  @ApiResponse({ status: 201, type: ReversalApprovalResponseDto })
  async requestReversal(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ReversalApprovalResponseDto> {
    const initiatorId = requireUserId(req, "requestReversal");
    return runInTransaction(this.dataSource, async (em) => {
      const receipt = await this.receiptRepository.findByIdOrFail(id, em);
      const instance = await this.approvalEngineService.submit(em, {
        domainCode: PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE,
        entityType: RECEIPT_ENTITY_TYPE,
        entityId: id,
        amount: receipt.total,
        initiatorId,
      });
      return { instanceId: instance.id, status: instance.status };
    });
  }

  @Post(":id/reverse")
  @RequirePermission("payments:receipt:reverse")
  @ApiOperation({ summary: "Reverse a POSTED receipt (BR-PAY-08 step 2 of 2 — requires an APPROVED PAYMENT_REVERSALS instance)" })
  @ApiResponse({ status: 200, type: ReceiptResponseDto })
  async reverse(
    @Param("id") id: string,
    @Body() dto: ReverseReceiptDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReceiptResponseDto> {
    const reversedBy = requireUserId(req, "reverse");
    const instance = await this.approvalEngineService.getStatus(RECEIPT_ENTITY_TYPE, id);
    if (!instance || instance.id !== dto.approvalRef || instance.status !== "APPROVED") {
      throw new ValidationException(
        `BR-PAY-08: approvalRef ${dto.approvalRef} is not an APPROVED PAYMENT_REVERSALS instance for receipt ${id} — ` +
          "submit via POST .../reverse/request and have it decided first",
      );
    }
    const contra = await runInTransaction(this.dataSource, (em) =>
      this.receiptsService.reverseReceipt(em, id, dto.reasonCode, dto.approvalRef, reversedBy),
    );
    return toView(contra);
  }

  @Post(":id/reprint")
  @RequirePermission("payments:receipt:reprint")
  @ApiOperation({ summary: "Increment reprint_count and return the receipt for reprinting — the one column trg_pay_receipt_immutable leaves ordinarily writable" })
  @ApiResponse({ status: 200, type: ReceiptResponseDto })
  async reprint(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ReceiptResponseDto> {
    const actorId = requireUserId(req, "reprint");
    const receipt = await this.receiptRepository.findByIdOrFail(id);
    receipt.reprintCount += 1;
    receipt.updatedBy = actorId;
    return toView(await this.receiptRepository.save(receipt));
  }
}
