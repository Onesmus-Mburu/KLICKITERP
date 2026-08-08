import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

const MESSAGE_STATUSES = ["QUEUED", "SENT", "DELIVERED", "FAILED", "OPTED_OUT"] as const;

/** Filters for the READ-ONLY `messages.controller.ts` list endpoint — no mutation endpoint exists (see that controller's doc comment). */
export class ListMessagesQueryDto {
  @ApiPropertyOptional({ enum: MESSAGE_STATUSES })
  @IsOptional()
  @IsIn(MESSAGE_STATUSES)
  status?: (typeof MESSAGE_STATUSES)[number];

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  broadcastId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
