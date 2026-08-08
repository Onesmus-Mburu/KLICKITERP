import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AcademicCalendarService } from "../application/academic-calendar.service";
import { CreateAcademicYearDto } from "./dto/create-academic-year.dto";
import { UpdateAcademicYearDto } from "./dto/update-academic-year.dto";
import { CreateTermDto } from "./dto/create-term.dto";
import { UpdateTermDto } from "./dto/update-term.dto";
import { SetBillingLockDto } from "./dto/set-billing-lock.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * Covers both `/academic-years` and `/terms` routes (one service, one
 * controller file per the task's module anatomy) — no class-level prefix so
 * each handler declares its own full path.
 */
@ApiTags("academic-calendar")
@Controller()
export class AcademicCalendarController {
  constructor(private readonly academicCalendarService: AcademicCalendarService) {}

  // ---- Academic years ----

  @Post("academic-years")
  @RequirePermission("settings:academic-year:manage")
  @ApiOperation({ summary: "Create an academic year" })
  @ApiResponse({ status: 201 })
  async createYear(@Body() dto: CreateAcademicYearDto, @Req() req: AuthenticatedRequest) {
    return this.academicCalendarService.createYear(dto, req.user?.sub ?? null);
  }

  @Get("academic-years")
  @RequirePermission("settings:academic-year:view")
  @ApiOperation({ summary: "List academic years" })
  async listYears() {
    return this.academicCalendarService.listYears();
  }

  @Get("academic-years/:id")
  @RequirePermission("settings:academic-year:view")
  @ApiOperation({ summary: "Get an academic year by id" })
  async findYear(@Param("id") id: string) {
    return this.academicCalendarService.findYearByIdOrFail(id);
  }

  @Patch("academic-years/:id")
  @RequirePermission("settings:academic-year:manage")
  @ApiOperation({ summary: "Update an academic year's name/dates" })
  async updateYear(@Param("id") id: string, @Body() dto: UpdateAcademicYearDto, @Req() req: AuthenticatedRequest) {
    return this.academicCalendarService.updateYear(id, dto, req.user?.sub ?? null);
  }

  @Post("academic-years/:id/set-current")
  @RequirePermission("settings:academic-year:manage")
  @ApiOperation({ summary: "Mark this academic year current (unsets the previous current year, atomically)" })
  async setCurrentYear(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.academicCalendarService.setCurrentYear(id, req.user?.sub ?? null);
  }

  // ---- Terms ----

  @Post("terms")
  @RequirePermission("settings:term:manage")
  @ApiOperation({ summary: "Create a term under an academic year" })
  @ApiResponse({ status: 201 })
  async createTerm(@Body() dto: CreateTermDto, @Req() req: AuthenticatedRequest) {
    return this.academicCalendarService.createTerm(dto, req.user?.sub ?? null);
  }

  @Get("terms")
  @RequirePermission("settings:term:view")
  @ApiOperation({ summary: "List terms, optionally scoped to one academic year" })
  async listTerms(@Query("academicYearId") academicYearId?: string) {
    return this.academicCalendarService.listTerms(academicYearId);
  }

  @Get("terms/:id")
  @RequirePermission("settings:term:view")
  @ApiOperation({ summary: "Get a term by id" })
  async findTerm(@Param("id") id: string) {
    return this.academicCalendarService.findTermByIdOrFail(id);
  }

  @Patch("terms/:id")
  @RequirePermission("settings:term:manage")
  @ApiOperation({
    summary: "Update a term",
    description: "seq/startsOn/endsOn are rejected while the term is billing-locked.",
  })
  async updateTerm(@Param("id") id: string, @Body() dto: UpdateTermDto, @Req() req: AuthenticatedRequest) {
    return this.academicCalendarService.updateTerm(id, dto, req.user?.sub ?? null);
  }

  @Post("terms/:id/set-current")
  @RequirePermission("settings:term:manage")
  @ApiOperation({ summary: "Mark this term current (unsets the previous current term, atomically)" })
  async setCurrentTerm(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.academicCalendarService.setCurrentTerm(id, req.user?.sub ?? null);
  }

  @Patch("terms/:id/billing-lock")
  @RequirePermission("settings:term:manage")
  @ApiOperation({ summary: "Toggle a term's billing lock" })
  async setBillingLock(@Param("id") id: string, @Body() dto: SetBillingLockDto, @Req() req: AuthenticatedRequest) {
    return this.academicCalendarService.setBillingLock(id, dto.locked, req.user?.sub ?? null);
  }
}
