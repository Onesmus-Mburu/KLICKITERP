import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { PaginationQueryDto } from "../../../shared/pagination/pagination.dto";
import { StudentsService } from "../application/students.service";
import { StdStudentStatus } from "../domain/std-student.entity";
import { AdmissionNoAutogenSettingDto } from "./dto/admission-no-autogen-setting.dto";
import { ChangeStudentStatusDto } from "./dto/change-student-status.dto";
import { CreateStudentDto } from "./dto/create-student.dto";
import { ListStudentsResponseDto } from "./dto/list-students-response.dto";
import { StudentResponseDto } from "./dto/student-response.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * `std_student` CRUD + admission workflow + `GET .../search` (FR-PAY-002)
 * + status-transition endpoints + `POST .../:id/exit-clear` + the Phase 6
 * Slice 2b item 8 admission-no-autogen settings pair. `search` and
 * `settings/admission-no-autogen` are both 2+-segment static paths, so
 * neither is at risk of being swallowed by the single-segment `:id` dynamic
 * route regardless of registration order (same non-collision reasoning as
 * `AccountsController`'s `tree`) — registered near the top anyway, next to
 * `search`, for readability.
 */
@ApiTags("students")
@Controller("students")
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @RequirePermission("students:student:manage")
  @ApiOperation({ summary: "Enroll a new student (admission workflow) — admissionNo omitted auto-generates if enabled" })
  @ApiResponse({ status: 201, type: StudentResponseDto })
  async create(@Body() dto: CreateStudentDto, @Req() req: AuthenticatedRequest): Promise<StudentResponseDto> {
    return toView(await this.studentsService.create(dto, req.user?.sub ?? null));
  }

  @Get("settings/admission-no-autogen")
  @RequirePermission("students:student:manage")
  @ApiOperation({ summary: "Get the admission-number autogen setting (Phase 6 Slice 2b item 8)" })
  @ApiResponse({ status: 200, type: AdmissionNoAutogenSettingDto })
  async getAdmissionNoAutogenSetting(): Promise<AdmissionNoAutogenSettingDto> {
    return this.studentsService.getAdmissionNoAutogenSetting();
  }

  @Put("settings/admission-no-autogen")
  @RequirePermission("students:student:manage")
  @ApiOperation({ summary: "Enable/disable admission-number autogen and set its prefix" })
  @ApiResponse({ status: 200, type: AdmissionNoAutogenSettingDto })
  async setAdmissionNoAutogenSetting(
    @Body() dto: AdmissionNoAutogenSettingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdmissionNoAutogenSettingDto> {
    return this.studentsService.setAdmissionNoAutogenSetting(dto, req.user?.sub ?? null);
  }

  @Get("search")
  @RequirePermission("students:student:view")
  @ApiOperation({ summary: "FR-PAY-002: cashier lookup by name/admission number, ≤2s trigram search" })
  @ApiResponse({ status: 200, type: [StudentResponseDto] })
  async search(@Query("q") q: string, @Query("limit") limit?: string): Promise<StudentResponseDto[]> {
    const results = await this.studentsService.search(q ?? "", limit ? Number(limit) : undefined);
    return results.map(toView);
  }

  /**
   * Phase 6 Slice 2c — real server-side pagination (G-03), Students only
   * (see `StudentsService.list()`'s doc comment for the scope note). `page`/
   * `pageSize` come from the existing `PaginationQueryDto` (default
   * pageSize 20, max 200) alongside the pre-existing classId/streamId/status
   * filters — a real, additive change, not a breaking one: a caller that
   * never sends `page`/`pageSize` still gets page 1 at the default size,
   * same as `UsersController.list()`.
   */
  @Get()
  @RequirePermission("students:student:view")
  @ApiOperation({ summary: "List students, optionally filtered by classId/streamId/status, real server-side pagination" })
  @ApiResponse({ status: 200, type: ListStudentsResponseDto })
  async list(
    @Query() pagination: PaginationQueryDto,
    @Query("classId") classId?: string,
    @Query("streamId") streamId?: string,
    @Query("status") status?: StdStudentStatus,
  ): Promise<ListStudentsResponseDto> {
    const { items, total } = await this.studentsService.list({
      classId,
      streamId: streamId === undefined ? undefined : streamId === "null" ? null : streamId,
      status,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    return { items: items.map(toView), total };
  }

  @Get(":id")
  @RequirePermission("students:student:view")
  @ApiOperation({ summary: "Get a student by id" })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  async findOne(@Param("id") id: string): Promise<StudentResponseDto> {
    return toView(await this.studentsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("students:student:manage")
  @ApiOperation({ summary: "Update a student's mutable fields" })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateStudentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StudentResponseDto> {
    return toView(await this.studentsService.update(id, dto, req.user?.sub ?? null));
  }

  @Post(":id/status")
  @RequirePermission("students:student:manage")
  @ApiOperation({
    summary:
      "Transition status (ACTIVE<->SUSPENDED, or into ALUMNI/TRANSFERRED/WITHDRAWN — the latter three require exit_cleared=true first)",
  })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  async changeStatus(
    @Param("id") id: string,
    @Body() dto: ChangeStudentStatusDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StudentResponseDto> {
    return toView(await this.studentsService.changeStatus(id, dto.status, req.user?.sub ?? null));
  }

  @Post(":id/exit-clear")
  @RequirePermission("students:student:manage")
  @ApiOperation({
    summary:
      "Manually mark exit_cleared=true (BR-BILL-15 placeholder — real zero-balance check needs Billing/Module 9, not built yet)",
  })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  async exitClear(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<StudentResponseDto> {
    return toView(await this.studentsService.markExitCleared(id, req.user?.sub ?? null));
  }

  /**
   * Phase 6 Slice 2b — Student delete. Gated on `students:student:manage` —
   * the same single permission that already gates create/update/status-change
   * on this controller, matching this module's established
   * one-permission-per-entity convention (no separate `students:student:delete`
   * code invented). A more granular delete-specific permission split is
   * explicitly deferred to future RBAC work, not built here.
   */
  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("students:student:manage")
  @ApiOperation({
    summary:
      "Delete a student — rejected with 409 if any real financial/cross-module reference exists (ledger entries, invoices, receipts, etc.); guardian LINK rows are auto-deleted, guardians themselves are untouched",
  })
  @ApiResponse({ status: 204 })
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.studentsService.delete(id, req.user?.sub ?? null);
  }
}

function toView(student: {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  searchName: string;
  classId: string;
  streamId: string | null;
  status: string;
  boarding: string;
  feeGroupId: string | null;
  sponsorId: string | null;
  transportRouteId: string | null;
  photoFileId: string | null;
  customFields: Record<string, unknown>;
  enrolledOn: string;
  exitedOn: string | null;
  exitCleared: boolean;
}): StudentResponseDto {
  return {
    id: student.id,
    admissionNo: student.admissionNo,
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    searchName: student.searchName,
    classId: student.classId,
    streamId: student.streamId,
    status: student.status,
    boarding: student.boarding,
    feeGroupId: student.feeGroupId,
    sponsorId: student.sponsorId,
    transportRouteId: student.transportRouteId,
    photoFileId: student.photoFileId,
    customFields: student.customFields,
    enrolledOn: student.enrolledOn,
    exitedOn: student.exitedOn,
    exitCleared: student.exitCleared,
  };
}
