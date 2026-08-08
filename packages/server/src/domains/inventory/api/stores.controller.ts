import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { StoresService } from "../application/stores.service";
import { InvStoreEntity } from "../domain/inv-store.entity";
import { CreateStoreDto, StoreResponseDto, UpdateStoreDto } from "./dto/store.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: InvStoreEntity): StoreResponseDto {
  return { id: entity.id, name: entity.name, location: entity.location, keeperUserId: entity.keeperUserId, isActive: entity.isActive };
}

/** `inv_store` CRUD — physical/logical stock locations. No dedicated `...:view` code — GETs reuse `inventory:store:manage`. */
@ApiTags("inventory-stores")
@Controller("inventory/stores")
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  @RequirePermission("inventory:store:manage")
  @ApiOperation({ summary: "Create a store" })
  @ApiResponse({ status: 201, type: StoreResponseDto })
  async create(@Body() dto: CreateStoreDto, @Req() req: AuthenticatedRequest): Promise<StoreResponseDto> {
    const created = await this.storesService.create(
      { name: dto.name, location: dto.location, keeperUserId: dto.keeperUserId },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("inventory:store:manage")
  @ApiOperation({ summary: "List stores, optionally filtered by is_active" })
  @ApiResponse({ status: 200, type: [StoreResponseDto] })
  async list(@Query("isActive") isActive?: string): Promise<StoreResponseDto[]> {
    const filter = isActive === undefined ? {} : { isActive: isActive === "true" };
    return (await this.storesService.list(filter)).map(toView);
  }

  @Get(":id")
  @RequirePermission("inventory:store:manage")
  @ApiOperation({ summary: "Get a store by id" })
  @ApiResponse({ status: 200, type: StoreResponseDto })
  async findOne(@Param("id") id: string): Promise<StoreResponseDto> {
    return toView(await this.storesService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("inventory:store:manage")
  @ApiOperation({ summary: "Update a store" })
  @ApiResponse({ status: 200, type: StoreResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateStoreDto, @Req() req: AuthenticatedRequest): Promise<StoreResponseDto> {
    const updated = await this.storesService.update(
      id,
      { name: dto.name, location: dto.location, keeperUserId: dto.keeperUserId, isActive: dto.isActive },
      req.user?.sub ?? null,
    );
    return toView(updated);
  }
}
