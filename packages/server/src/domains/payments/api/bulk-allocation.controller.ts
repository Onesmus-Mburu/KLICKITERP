import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { BulkAllocationService } from "../application/bulk-allocation.service";
import { PayBulkAllocationBatchEntity } from "../domain/pay-bulk-allocation-batch.entity";
import { PayBulkAllocationBatchLineEntity } from "../domain/pay-bulk-allocation-batch-line.entity";
import {
  BulkAllocationBatchLineResponseDto,
  BulkAllocationBatchResponseDto,
  CreateBulkAllocationBatchDto,
} from "./dto/bulk-allocation.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PayBulkAllocationBatchEntity): BulkAllocationBatchResponseDto {
  return {
    id: entity.id,
    instrument: entity.instrument,
    total: entity.total.toDecimalString(),
    status: entity.status,
    createdReceipts: entity.createdReceipts,
    bankAccountId: entity.bankAccountId,
  };
}

function toLineView(entity: PayBulkAllocationBatchLineEntity): BulkAllocationBatchLineResponseDto {
  return {
    id: entity.id,
    batchId: entity.batchId,
    studentId: entity.studentId,
    amount: entity.amount.toDecimalString(),
    receiptId: entity.receiptId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`BulkAllocationController.${action}: no authenticated user on request`);
  return userId;
}

/** `pay_bulk_allocation_batch`/`pay_bulk_allocation_batch_line` — bulk bank-statement / M-Pesa bulk-payment allocation. */
@ApiTags("payments-bulk-allocation")
@Controller("payments/bulk-allocations")
export class BulkAllocationController {
  constructor(private readonly bulkAllocationService: BulkAllocationService) {}

  @Post()
  @RequirePermission("payments:bulk-allocation:manage")
  @ApiOperation({ summary: "Create a batch, resolving each line's admission_no to a student (rejects up front on any unresolved admission_no)" })
  @ApiResponse({ status: 201, type: BulkAllocationBatchResponseDto })
  async create(@Body() dto: CreateBulkAllocationBatchDto, @Req() req: AuthenticatedRequest): Promise<BulkAllocationBatchResponseDto> {
    const initiatedBy = requireUserId(req, "create");
    const batch = await this.bulkAllocationService.createBatch(
      dto.instrument,
      dto.lines.map((line) => ({ admissionNo: line.admissionNo, amount: Money.fromDecimalString(line.amount) })),
      dto.bankAccountId,
      initiatedBy,
    );
    return toView(batch);
  }

  @Get(":id")
  @RequirePermission("payments:bulk-allocation:manage")
  @ApiOperation({ summary: "Get a batch by id" })
  @ApiResponse({ status: 200, type: BulkAllocationBatchResponseDto })
  async findOne(@Param("id") id: string): Promise<BulkAllocationBatchResponseDto> {
    return toView(await this.bulkAllocationService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("payments:bulk-allocation:manage")
  @ApiOperation({ summary: "List a batch's lines" })
  @ApiResponse({ status: 200, type: [BulkAllocationBatchLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<BulkAllocationBatchLineResponseDto[]> {
    return (await this.bulkAllocationService.listLines(id)).map(toLineView);
  }

  @Post(":id/match-and-post")
  @RequirePermission("payments:bulk-allocation:manage")
  @ApiOperation({ summary: "Match every unprocessed line to a receipt (partial-failure-tolerant — a per-line failure parks that line's amount in suspense rather than aborting the batch)" })
  @ApiResponse({ status: 200, type: BulkAllocationBatchResponseDto })
  async matchAndPost(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BulkAllocationBatchResponseDto> {
    const initiatedBy = requireUserId(req, "matchAndPost");
    return toView(await this.bulkAllocationService.matchAndPost(id, initiatedBy));
  }
}
