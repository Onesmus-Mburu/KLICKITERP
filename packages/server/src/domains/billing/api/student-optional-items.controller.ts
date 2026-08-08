import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { StudentOptionalItemsService } from "../application/student-optional-items.service";
import { BillStudentOptionalItemEntity } from "../domain/bill-student-optional-item.entity";
import {
  CreateStudentOptionalItemDto,
  StudentOptionalItemResponseDto,
  UpdateStudentOptionalItemDto,
} from "./dto/student-optional-item.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillStudentOptionalItemEntity): StudentOptionalItemResponseDto {
  return {
    id: entity.id,
    studentId: entity.studentId,
    termId: entity.termId,
    feeCategoryId: entity.feeCategoryId,
    amountOverride: entity.amountOverride?.toDecimalString() ?? null,
  };
}

@ApiTags("billing-student-optional-items")
@Controller("billing/student-optional-items")
export class StudentOptionalItemsController {
  constructor(private readonly service: StudentOptionalItemsService) {}

  @Post()
  @RequirePermission("billing:optional-item:manage")
  @ApiOperation({ summary: "Opt a student into an optional fee-structure line (FR-BILL-013)" })
  @ApiResponse({ status: 201, type: StudentOptionalItemResponseDto })
  async create(
    @Body() dto: CreateStudentOptionalItemDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StudentOptionalItemResponseDto> {
    return toView(
      await this.service.create(
        {
          studentId: dto.studentId,
          termId: dto.termId,
          feeCategoryId: dto.feeCategoryId,
          amountOverride: dto.amountOverride ? Money.fromDecimalString(dto.amountOverride) : null,
        },
        req.user?.sub ?? null,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:optional-item:view")
  @ApiOperation({ summary: "List a student's optional-item opt-ins for a term" })
  @ApiResponse({ status: 200, type: [StudentOptionalItemResponseDto] })
  async list(@Query("studentId") studentId: string, @Query("termId") termId: string): Promise<StudentOptionalItemResponseDto[]> {
    return (await this.service.listByStudentAndTerm(studentId, termId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:optional-item:view")
  @ApiOperation({ summary: "Get an optional-item opt-in by id" })
  @ApiResponse({ status: 200, type: StudentOptionalItemResponseDto })
  async findOne(@Param("id") id: string): Promise<StudentOptionalItemResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("billing:optional-item:manage")
  @ApiOperation({ summary: "Update an optional-item opt-in's amount override" })
  @ApiResponse({ status: 200, type: StudentOptionalItemResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateStudentOptionalItemDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StudentOptionalItemResponseDto> {
    return toView(
      await this.service.update(
        id,
        { amountOverride: dto.amountOverride !== undefined ? Money.fromDecimalString(dto.amountOverride) : undefined },
        req.user?.sub ?? null,
      ),
    );
  }

  @Delete(":id")
  @RequirePermission("billing:optional-item:manage")
  @ApiOperation({ summary: "Remove an optional-item opt-in" })
  @ApiResponse({ status: 200 })
  async remove(@Param("id") id: string): Promise<{ deleted: boolean }> {
    await this.service.remove(id);
    return { deleted: true };
  }
}
