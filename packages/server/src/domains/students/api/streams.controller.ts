import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { StreamsService } from "../application/streams.service";
import { CreateStreamDto } from "./dto/create-stream.dto";
import { StreamResponseDto } from "./dto/stream-response.dto";
import { UpdateStreamDto } from "./dto/update-stream.dto";
import { AuthenticatedRequest } from "./request-context";

@ApiTags("students-streams")
@Controller("students/streams")
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

  @Post()
  @RequirePermission("students:class:manage")
  @ApiOperation({ summary: "Create a std_stream, scoped to a class" })
  @ApiResponse({ status: 201, type: StreamResponseDto })
  async create(@Body() dto: CreateStreamDto, @Req() req: AuthenticatedRequest): Promise<StreamResponseDto> {
    return this.streamsService.create(dto, req.user?.sub ?? null);
  }

  @Get()
  @RequirePermission("students:class:view")
  @ApiOperation({ summary: "List streams for a class" })
  @ApiResponse({ status: 200, type: [StreamResponseDto] })
  async listByClass(@Query("classId") classId: string): Promise<StreamResponseDto[]> {
    return this.streamsService.listByClass(classId);
  }

  @Get(":id")
  @RequirePermission("students:class:view")
  @ApiOperation({ summary: "Get a stream by id" })
  @ApiResponse({ status: 200, type: StreamResponseDto })
  async findOne(@Param("id") id: string): Promise<StreamResponseDto> {
    return this.streamsService.findByIdOrFail(id);
  }

  @Patch(":id")
  @RequirePermission("students:class:manage")
  @ApiOperation({ summary: "Update a stream" })
  @ApiResponse({ status: 200, type: StreamResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateStreamDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamResponseDto> {
    return this.streamsService.update(id, dto, req.user?.sub ?? null);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("students:class:manage")
  @ApiOperation({ summary: "Delete a stream — rejected with 409 if any student still references it" })
  @ApiResponse({ status: 204 })
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.streamsService.delete(id, req.user?.sub ?? null);
  }
}
