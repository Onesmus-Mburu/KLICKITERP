import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { GrnService } from "../application/grn.service";
import { ProcGrnEntity } from "../domain/proc-grn.entity";
import { ProcGrnLineEntity } from "../domain/proc-grn-line.entity";
import { GrnLineResponseDto, GrnResponseDto, ReceiveGrnDto } from "./dto/grn.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ProcGrnEntity): GrnResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    poId: entity.poId,
    receivedBy: entity.receivedBy,
    receivedAt: entity.receivedAt,
    status: entity.status,
    journalId: entity.journalId,
    notes: entity.notes,
  };
}

function toLineView(entity: ProcGrnLineEntity): GrnLineResponseDto {
  return {
    id: entity.id,
    grnId: entity.grnId,
    poLineId: entity.poLineId,
    receivedQty: entity.receivedQty,
    rejectedQty: entity.rejectedQty,
    rejectionReason: entity.rejectionReason,
    unitCost: entity.unitCost.toDecimalString(),
    storeId: entity.storeId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`GrnController.${action}: no authenticated user on request`);
  return userId;
}

/**
 * `proc_grn` (+lines): `receive()` (BR-PROC-01/BR-PROC-03) and `post()`
 * (P-18/P-19). No dedicated `...:view` code exists — GETs reuse
 * `procurement:grn:receive` (the base permission a receiving clerk needs to
 * work with GRNs at all).
 */
@ApiTags("procurement-grn")
@Controller("procurement/grn")
export class GrnController {
  constructor(
    private readonly grnService: GrnService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post("receive")
  @RequirePermission("procurement:grn:receive")
  @ApiOperation({ summary: "Receive goods against an ISSUED+ PO (starts DRAFT, BR-PROC-01/BR-PROC-03)" })
  @ApiResponse({ status: 201, type: GrnResponseDto })
  async receive(@Body() dto: ReceiveGrnDto, @Req() req: AuthenticatedRequest): Promise<GrnResponseDto> {
    const receivedBy = requireUserId(req, "receive");
    const grn = await runInTransaction(this.dataSource, (manager) =>
      this.grnService.receive(manager, {
        poId: dto.poId,
        receivedBy,
        notes: dto.notes ?? null,
        lines: dto.lines.map((line) => ({
          poLineId: line.poLineId,
          receivedQty: line.receivedQty,
          rejectedQty: line.rejectedQty,
          rejectionReason: line.rejectionReason ?? null,
          unitCost: Money.fromDecimalString(line.unitCost),
          storeId: line.storeId ?? null,
        })),
      }),
    );
    return toView(grn);
  }

  @Get()
  @RequirePermission("procurement:grn:receive")
  @ApiOperation({ summary: "List GRNs for a PO" })
  @ApiResponse({ status: 200, type: [GrnResponseDto] })
  async list(@Query("poId") poId: string): Promise<GrnResponseDto[]> {
    return (await this.grnService.listByPo(poId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("procurement:grn:receive")
  @ApiOperation({ summary: "Get a GRN by id" })
  @ApiResponse({ status: 200, type: GrnResponseDto })
  async findOne(@Param("id") id: string): Promise<GrnResponseDto> {
    return toView(await this.grnService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("procurement:grn:receive")
  @ApiOperation({ summary: "List a GRN's lines" })
  @ApiResponse({ status: 200, type: [GrnLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<GrnLineResponseDto[]> {
    return (await this.grnService.listLines(id)).map(toLineView);
  }

  @Post(":id/post")
  @RequirePermission("procurement:grn:post")
  @ApiOperation({ summary: "Post a DRAFT GRN (realizes P-18/P-19)" })
  @ApiResponse({ status: 200, type: GrnResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<GrnResponseDto> {
    const postedBy = requireUserId(req, "post");
    const grn = await runInTransaction(this.dataSource, (manager) => this.grnService.post(manager, id, postedBy));
    return toView(grn);
  }
}
