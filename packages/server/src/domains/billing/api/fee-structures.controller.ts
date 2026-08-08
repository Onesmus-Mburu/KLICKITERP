import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
// Phase 6 Slice 16 (Part 1) — barrel import, same one-directional-dependency
// shape `module-deps.json`'s updated `domains/billing` entry documents.
import { DocumentVerificationService } from "../../../platform/document-verification";
import { FEE_STRUCTURE_DOCUMENT_TYPE, FeeStructuresService } from "../application/fee-structures.service";
import { BillFeeStructureEntity } from "../domain/bill-fee-structure.entity";
import { BillFeeStructureLineEntity } from "../domain/bill-fee-structure-line.entity";
import {
  CreateFeeStructureDto,
  CreateFeeStructureLineDto,
  FeeCategoryForScopeResponseDto,
  FeeStructureLineResponseDto,
  FeeStructureResponseDto,
  UpdateFeeStructureLineDto,
} from "./dto/fee-structure.dto";
import { AuthenticatedRequest } from "./request-context";

/** `verificationToken` defaults to `null` — only `findOne()` resolves the real value (see that handler's own comment for why). */
function toView(entity: BillFeeStructureEntity, verificationToken: string | null = null): FeeStructureResponseDto {
  return {
    id: entity.id,
    academicYearId: entity.academicYearId,
    classId: entity.classId,
    streamId: entity.streamId,
    boarding: entity.boarding,
    feeGroupId: entity.feeGroupId,
    version: entity.version,
    status: entity.status,
    publishedAt: entity.publishedAt,
    verificationToken,
  };
}

function toLineView(entity: BillFeeStructureLineEntity): FeeStructureLineResponseDto {
  return {
    id: entity.id,
    feeStructureId: entity.feeStructureId,
    feeCategoryId: entity.feeCategoryId,
    termId: entity.termId,
    dueDate: entity.dueDate,
    amount: entity.amount.toDecimalString(),
    isOptional: entity.isOptional,
  };
}

@ApiTags("billing-fee-structures")
@Controller("billing/fee-structures")
export class FeeStructuresController {
  constructor(
    private readonly service: FeeStructuresService,
    // Phase 6 Slice 16 (Part 1) — appended at the end, same discipline every
    // prior constructor extension in this codebase follows.
    private readonly documentVerificationService: DocumentVerificationService,
  ) {}

  @Post()
  @RequirePermission("billing:fee-structure:manage")
  @ApiOperation({ summary: "Create a DRAFT fee structure (year-scoped — Phase 6 Slice 3b)" })
  @ApiResponse({ status: 201, type: FeeStructureResponseDto })
  async create(@Body() dto: CreateFeeStructureDto, @Req() req: AuthenticatedRequest): Promise<FeeStructureResponseDto> {
    return toView(
      await this.service.createDraft(
        {
          academicYearId: dto.academicYearId,
          classId: dto.classId,
          streamId: dto.streamId ?? null,
          boarding: dto.boarding ?? null,
          feeGroupId: dto.feeGroupId ?? null,
        },
        req.user?.sub ?? null,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:fee-structure:view")
  @ApiOperation({ summary: "List fee structures for an academic year/class" })
  @ApiResponse({ status: 200, type: [FeeStructureResponseDto] })
  async list(
    @Query("academicYearId") academicYearId: string,
    @Query("classId") classId: string,
  ): Promise<FeeStructureResponseDto[]> {
    // `.map(toView)` (not this) would leak `Array.map`'s own `index` argument
    // positionally into `toView`'s optional `verificationToken` param — wrap
    // in an arrow so every row gets the intended default (`null`).
    return (await this.service.listByYearAndClass(academicYearId, classId)).map((row) => toView(row));
  }

  /**
   * Phase 6 Slice 8 — declared BEFORE `@Get(":id")` deliberately: Nest/Express
   * matches routes in declaration order, and `:id` would otherwise swallow
   * the literal `categories-for-scope` segment as an id value.
   */
  @Get("categories-for-scope")
  @RequirePermission("billing:fee-structure:view")
  @ApiOperation({ summary: "List every fee category (deduped) across every PUBLISHED fee structure for an academic year/class — chip-picker catalog for bulk ADHOC invoice generation" })
  @ApiResponse({ status: 200, type: [FeeCategoryForScopeResponseDto] })
  async categoriesForScope(
    @Query("academicYearId") academicYearId: string,
    @Query("classId") classId: string,
  ): Promise<FeeCategoryForScopeResponseDto[]> {
    return (await this.service.listCategoriesForScope(academicYearId, classId)).map((row) => ({
      feeCategoryId: row.feeCategoryId,
      name: row.name,
      exampleAmount: row.exampleAmount.toDecimalString(),
    }));
  }

  @Get(":id")
  @RequirePermission("billing:fee-structure:view")
  @ApiOperation({ summary: "Get a fee structure by id" })
  @ApiResponse({ status: 200, type: FeeStructureResponseDto })
  async findOne(@Param("id") id: string): Promise<FeeStructureResponseDto> {
    const structure = await this.service.findByIdOrFail(id);
    // Phase 6 Slice 16 (Part 1) — resolved only on this "get by id" path
    // (not `list()`), avoiding an N+1 lookup per row in a year/class list.
    // `null` for a DRAFT structure (never published) or a row that predates
    // this feature.
    const verification = await this.documentVerificationService.findByDocument(FEE_STRUCTURE_DOCUMENT_TYPE, id);
    return toView(structure, verification?.token ?? null);
  }

  @Get(":id/lines")
  @RequirePermission("billing:fee-structure:view")
  @ApiOperation({ summary: "List a fee structure's lines" })
  @ApiResponse({ status: 200, type: [FeeStructureLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<FeeStructureLineResponseDto[]> {
    return (await this.service.listLines(id)).map(toLineView);
  }

  @Post(":id/lines")
  @RequirePermission("billing:fee-structure:manage")
  @ApiOperation({ summary: "Add a line to a DRAFT fee structure (term/due-date required — Phase 6 Slice 3b)" })
  @ApiResponse({ status: 201, type: FeeStructureLineResponseDto })
  async addLine(
    @Param("id") id: string,
    @Body() dto: CreateFeeStructureLineDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FeeStructureLineResponseDto> {
    return toLineView(
      await this.service.addLine(
        id,
        {
          feeCategoryId: dto.feeCategoryId,
          termId: dto.termId,
          dueDate: dto.dueDate,
          amount: Money.fromDecimalString(dto.amount),
          isOptional: dto.isOptional,
        },
        req.user?.sub ?? null,
      ),
    );
  }

  @Post("lines/:lineId")
  @RequirePermission("billing:fee-structure:manage")
  @ApiOperation({ summary: "Update a DRAFT fee structure line's amount/term/due-date" })
  @ApiResponse({ status: 200, type: FeeStructureLineResponseDto })
  async updateLine(
    @Param("lineId") lineId: string,
    @Body() dto: UpdateFeeStructureLineDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FeeStructureLineResponseDto> {
    return toLineView(
      await this.service.updateLine(
        lineId,
        { amount: Money.fromDecimalString(dto.amount), termId: dto.termId, dueDate: dto.dueDate },
        req.user?.sub ?? null,
      ),
    );
  }

  @Post(":id/publish")
  @RequirePermission("billing:fee-structure:publish")
  @ApiOperation({ summary: "Publish a DRAFT fee structure (BR-BILL-03)" })
  @ApiResponse({ status: 200, type: FeeStructureResponseDto })
  async publish(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FeeStructureResponseDto> {
    const actorId = req.user?.sub;
    if (!actorId) throw new Error("FeeStructuresController.publish: no authenticated user on request");
    return toView(await this.service.publish(id, actorId));
  }

  /**
   * Phase 6 Slice 3b — no separate delete permission minted, reusing
   * `billing:fee-structure:manage` (same precedent as the Students module's
   * own delete endpoint — `StudentsController.remove()` reuses
   * `students:student:manage` rather than inventing
   * `students:student:delete`).
   */
  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("billing:fee-structure:manage")
  @ApiOperation({ summary: "Delete a fee structure — rejected with 409 if any invoice still references it" })
  @ApiResponse({ status: 204 })
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.service.delete(id, req.user?.sub ?? null);
  }
}
