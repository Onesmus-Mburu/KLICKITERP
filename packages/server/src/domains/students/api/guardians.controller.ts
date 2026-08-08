import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { GuardiansService } from "../application/guardians.service";
import { CreateGuardianDto } from "./dto/create-guardian.dto";
import { CreateGuardianResponseDto, GuardianResponseDto, StudentGuardianLinkResponseDto } from "./dto/guardian-response.dto";
import { LinkGuardianDto } from "./dto/link-guardian.dto";
import { UpdateGuardianDto } from "./dto/update-guardian.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * `std_guardian` CRUD + `std_student_guardian` link/unlink. Shares the
 * `students` path prefix with `StudentsController` — registered BEFORE it in
 * `students.module.ts`'s `controllers` array so this controller's static
 * `students/guardians` routes win over `StudentsController`'s dynamic
 * `students/:id` route for the same 2-segment path (Express/Nest tries
 * layers in registration order; same precedent as `AccountsController`
 * registering `tree` before `:id` within one controller, just across two
 * controllers here).
 */
@ApiTags("students-guardians")
@Controller("students")
export class GuardiansController {
  constructor(private readonly guardiansService: GuardiansService) {}

  @Post("guardians")
  @RequirePermission("students:guardian:manage")
  @ApiOperation({
    summary:
      "Create a std_guardian — reuses an existing guardian (matched by phone, then email) instead of creating a duplicate or erroring, for the sibling-guardian case (Phase 6 Slice 2c)",
  })
  @ApiResponse({ status: 201, type: CreateGuardianResponseDto })
  async create(@Body() dto: CreateGuardianDto, @Req() req: AuthenticatedRequest): Promise<CreateGuardianResponseDto> {
    const { guardian, wasExisting } = await this.guardiansService.create(dto, req.user?.sub ?? null);
    return { ...guardian, wasExisting };
  }

  @Get("guardians")
  @RequirePermission("students:guardian:manage")
  @ApiOperation({ summary: "List guardians" })
  @ApiResponse({ status: 200, type: [GuardianResponseDto] })
  async list(): Promise<GuardianResponseDto[]> {
    return this.guardiansService.list();
  }

  @Get("guardians/:id")
  @RequirePermission("students:guardian:manage")
  @ApiOperation({ summary: "Get a guardian by id" })
  @ApiResponse({ status: 200, type: GuardianResponseDto })
  async findOne(@Param("id") id: string): Promise<GuardianResponseDto> {
    return this.guardiansService.findByIdOrFail(id);
  }

  @Patch("guardians/:id")
  @RequirePermission("students:guardian:manage")
  @ApiOperation({ summary: "Update a guardian" })
  @ApiResponse({ status: 200, type: GuardianResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateGuardianDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GuardianResponseDto> {
    return this.guardiansService.update(id, dto, req.user?.sub ?? null);
  }

  @Get(":studentId/guardians")
  @RequirePermission("students:guardian:manage")
  @ApiOperation({ summary: "List the guardian links for a student" })
  @ApiResponse({ status: 200, type: [StudentGuardianLinkResponseDto] })
  async listForStudent(@Param("studentId") studentId: string): Promise<StudentGuardianLinkResponseDto[]> {
    return this.guardiansService.listForStudent(studentId);
  }

  @Post(":studentId/guardians")
  @RequirePermission("students:guardian:manage")
  @ApiOperation({
    summary:
      "Link (or update the link attributes of) a guardian to a student — isPrimary enforces exactly-one-primary",
  })
  @ApiResponse({ status: 201, type: StudentGuardianLinkResponseDto })
  async link(
    @Param("studentId") studentId: string,
    @Body() dto: LinkGuardianDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StudentGuardianLinkResponseDto> {
    return this.guardiansService.linkToStudent(
      studentId,
      dto.guardianId,
      dto.relationship,
      dto.isPrimary ?? false,
      dto.receivesBilling ?? true,
      req.user?.sub ?? null,
    );
  }

  @Delete(":studentId/guardians/:guardianId")
  @HttpCode(204)
  @RequirePermission("students:guardian:manage")
  @ApiOperation({ summary: "Unlink a guardian from a student" })
  @ApiResponse({ status: 204 })
  async unlink(@Param("studentId") studentId: string, @Param("guardianId") guardianId: string): Promise<void> {
    await this.guardiansService.unlinkFromStudent(studentId, guardianId);
  }
}
