import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { ContractsService } from "../application/contracts.service";
import { ProcContractEntity, ProcContractStatus } from "../domain/proc-contract.entity";
import { ContractResponseDto, CreateContractDto, UpdateContractDto } from "./dto/contract.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ProcContractEntity): ContractResponseDto {
  return {
    id: entity.id,
    supplierId: entity.supplierId,
    title: entity.title,
    startsOn: entity.startsOn,
    endsOn: entity.endsOn,
    value: entity.value ? entity.value.toDecimalString() : null,
    renewalAlertDays: entity.renewalAlertDays,
    documentFileId: entity.documentFileId,
    status: entity.status,
  };
}

/** `proc_contract` CRUD, terminate/expire, and `listExpiringSoon()` (a query only — no dispatch, see ContractsService's own doc comment). */
@ApiTags("procurement-contracts")
@Controller("procurement/contracts")
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @RequirePermission("procurement:contract:manage")
  @ApiOperation({ summary: "Create an ACTIVE contract" })
  @ApiResponse({ status: 201, type: ContractResponseDto })
  async create(@Body() dto: CreateContractDto, @Req() req: AuthenticatedRequest): Promise<ContractResponseDto> {
    const created = await this.contractsService.create(
      {
        supplierId: dto.supplierId,
        title: dto.title,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        value: dto.value !== undefined ? Money.fromDecimalString(dto.value) : null,
        renewalAlertDays: dto.renewalAlertDays,
        documentFileId: dto.documentFileId ?? null,
      },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("procurement:contract:manage")
  @ApiOperation({ summary: "List contracts, optionally filtered by status/supplier" })
  @ApiResponse({ status: 200, type: [ContractResponseDto] })
  async list(
    @Query("status") status?: ProcContractStatus,
    @Query("supplierId") supplierId?: string,
  ): Promise<ContractResponseDto[]> {
    return (await this.contractsService.list({ status, supplierId })).map(toView);
  }

  @Get("expiring-soon")
  @RequirePermission("procurement:contract:manage")
  @ApiOperation({ summary: "ACTIVE contracts whose ends_on falls within their own renewal_alert_days (or a caller-supplied override) of today" })
  @ApiResponse({ status: 200, type: [ContractResponseDto] })
  async expiringSoon(@Query("withinDays") withinDays?: string): Promise<ContractResponseDto[]> {
    return (await this.contractsService.listExpiringSoon(withinDays ? Number(withinDays) : undefined)).map(toView);
  }

  @Get(":id")
  @RequirePermission("procurement:contract:manage")
  @ApiOperation({ summary: "Get a contract by id" })
  @ApiResponse({ status: 200, type: ContractResponseDto })
  async findOne(@Param("id") id: string): Promise<ContractResponseDto> {
    return toView(await this.contractsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("procurement:contract:manage")
  @ApiOperation({ summary: "Update a contract" })
  @ApiResponse({ status: 200, type: ContractResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateContractDto, @Req() req: AuthenticatedRequest): Promise<ContractResponseDto> {
    const updated = await this.contractsService.update(
      id,
      {
        title: dto.title,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        value: dto.value !== undefined ? Money.fromDecimalString(dto.value) : undefined,
        renewalAlertDays: dto.renewalAlertDays,
        documentFileId: dto.documentFileId,
      },
      req.user?.sub ?? null,
    );
    return toView(updated);
  }

  @Post(":id/terminate")
  @RequirePermission("procurement:contract:manage")
  @ApiOperation({ summary: "ACTIVE -> TERMINATED (early, deliberate end)" })
  @ApiResponse({ status: 200, type: ContractResponseDto })
  async terminate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ContractResponseDto> {
    return toView(await this.contractsService.terminate(id, req.user?.sub ?? null));
  }

  @Post(":id/mark-expired")
  @RequirePermission("procurement:contract:manage")
  @ApiOperation({ summary: "ACTIVE -> EXPIRED (natural end-of-term)" })
  @ApiResponse({ status: 200, type: ContractResponseDto })
  async markExpired(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ContractResponseDto> {
    return toView(await this.contractsService.markExpired(id, req.user?.sub ?? null));
  }
}
