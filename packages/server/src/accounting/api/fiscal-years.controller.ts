import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../shared/rbac/require-permission.decorator";
import { FiscalYearsService } from "../application/fiscal-years.service";
import { CreateFiscalYearDto } from "./dto/create-fiscal-year.dto";
import { FiscalYearResponseDto } from "./dto/fiscal-year-response.dto";
import { PeriodResponseDto } from "./dto/period-response.dto";
import { AuthenticatedRequest } from "./request-context";

/** `gl_fiscal_year` create + `gl_period` transition endpoints — see `FiscalYearsService`'s doc comment for the auto-generation/sequential-close design. */
@ApiTags("accounting-fiscal-years")
@Controller("accounting")
export class FiscalYearsController {
  constructor(private readonly fiscalYearsService: FiscalYearsService) {}

  @Post("fiscal-years")
  @RequirePermission("accounting:fiscal-year:manage")
  @ApiOperation({ summary: "Create a fiscal year and auto-generate its periods (OPEN, spanning the range)" })
  @ApiResponse({ status: 201, type: FiscalYearResponseDto })
  async create(@Body() dto: CreateFiscalYearDto, @Req() req: AuthenticatedRequest): Promise<FiscalYearResponseDto> {
    return this.fiscalYearsService.create(dto, req.user?.sub ?? null);
  }

  @Get("fiscal-years")
  @RequirePermission("accounting:fiscal-year:view")
  @ApiOperation({ summary: "List fiscal years" })
  @ApiResponse({ status: 200, type: [FiscalYearResponseDto] })
  async list(): Promise<FiscalYearResponseDto[]> {
    return this.fiscalYearsService.list();
  }

  @Get("fiscal-years/:id")
  @RequirePermission("accounting:fiscal-year:view")
  @ApiOperation({ summary: "Get a fiscal year by id" })
  @ApiResponse({ status: 200, type: FiscalYearResponseDto })
  async findOne(@Param("id") id: string): Promise<FiscalYearResponseDto> {
    return this.fiscalYearsService.findByIdOrFail(id);
  }

  @Get("fiscal-years/:id/periods")
  @RequirePermission("accounting:fiscal-year:view")
  @ApiOperation({ summary: "List periods for a fiscal year, ascending by seq" })
  @ApiResponse({ status: 200, type: [PeriodResponseDto] })
  async listPeriods(@Param("id") id: string): Promise<PeriodResponseDto[]> {
    return this.fiscalYearsService.listPeriods(id);
  }

  @Get("periods/:id")
  @RequirePermission("accounting:fiscal-year:view")
  @ApiOperation({ summary: "Get a period by id" })
  @ApiResponse({ status: 200, type: PeriodResponseDto })
  async findPeriod(@Param("id") id: string): Promise<PeriodResponseDto> {
    return this.fiscalYearsService.findPeriodByIdOrFail(id);
  }

  @Post("periods/:id/open")
  @RequirePermission("accounting:period:manage")
  @ApiOperation({ summary: "Reopen a period (not permitted once HARD_CLOSED — see sequential close enforcement)" })
  @ApiResponse({ status: 200, type: PeriodResponseDto })
  async openPeriod(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PeriodResponseDto> {
    return this.fiscalYearsService.openPeriod(id, req.user?.sub ?? null);
  }

  @Post("periods/:id/soft-close")
  @RequirePermission("accounting:period:manage")
  @ApiOperation({ summary: "Soft-close a period (blocks ordinary MANUAL/SYSTEM/REVERSING postings; CLOSING/OPENING still allowed)" })
  @ApiResponse({ status: 200, type: PeriodResponseDto })
  async softClosePeriod(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PeriodResponseDto> {
    return this.fiscalYearsService.softClosePeriod(id, req.user?.sub ?? null);
  }

  @Post("periods/:id/hard-close")
  @RequirePermission("accounting:period:manage")
  @ApiOperation({ summary: "Hard-close a period (final — requires the period to already be SOFT_CLOSED)" })
  @ApiResponse({ status: 200, type: PeriodResponseDto })
  async hardClosePeriod(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PeriodResponseDto> {
    return this.fiscalYearsService.hardClosePeriod(id, req.user?.sub ?? null);
  }
}
