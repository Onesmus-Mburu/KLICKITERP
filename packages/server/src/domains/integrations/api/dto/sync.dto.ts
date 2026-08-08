import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsObject, IsOptional, IsUUID, Min } from "class-validator";
import { INTG_SYNC_LOG_KINDS, INTG_SYNC_LOG_STATUSES } from "../../domain/intg-sync-log.entity";

const ACCOUNTING_SYNC_ENTITY_KINDS = ["INVOICE", "PAYMENT", "EXPENSE", "CUSTOMER"] as const;

export class PushEntityDto {
  @ApiProperty({ enum: INTG_SYNC_LOG_KINDS })
  @IsIn(INTG_SYNC_LOG_KINDS)
  kind!: (typeof INTG_SYNC_LOG_KINDS)[number];

  @ApiProperty({ enum: ACCOUNTING_SYNC_ENTITY_KINDS })
  @IsIn(ACCOUNTING_SYNC_ENTITY_KINDS)
  entityType!: (typeof ACCOUNTING_SYNC_ENTITY_KINDS)[number];

  @ApiProperty({ format: "uuid", description: "The local domain record id being synced" })
  @IsUUID()
  entityId!: string;

  @ApiProperty({ type: Object, description: "Provider-shaped entity body — transported as-is, see the adapter's own doc comment" })
  @IsObject()
  payload!: Record<string, unknown>;
}

export class TestConnectionDto {
  @ApiProperty({ enum: INTG_SYNC_LOG_KINDS })
  @IsIn(INTG_SYNC_LOG_KINDS)
  kind!: (typeof INTG_SYNC_LOG_KINDS)[number];
}

export class TestConnectionResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty()
  message!: string;
}

export class SyncLogResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: INTG_SYNC_LOG_KINDS })
  kind!: string;

  @ApiProperty()
  direction!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty({ format: "uuid" })
  entityId!: string;

  @ApiProperty({ enum: INTG_SYNC_LOG_STATUSES })
  status!: string;

  @ApiProperty({ nullable: true })
  providerRef!: string | null;

  @ApiProperty({ nullable: true })
  error!: string | null;

  @ApiProperty({ format: "date-time" })
  at!: string;
}

export class ListSyncLogQueryDto {
  @ApiPropertyOptional({ enum: INTG_SYNC_LOG_KINDS })
  @IsOptional()
  @IsIn(INTG_SYNC_LOG_KINDS)
  kind?: (typeof INTG_SYNC_LOG_KINDS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ enum: INTG_SYNC_LOG_STATUSES })
  @IsOptional()
  @IsIn(INTG_SYNC_LOG_STATUSES)
  status?: (typeof INTG_SYNC_LOG_STATUSES)[number];

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

export class ListSyncLogResponseDto {
  @ApiProperty({ type: [SyncLogResponseDto] })
  items!: SyncLogResponseDto[];

  @ApiProperty({ type: Object })
  meta!: { total: number; page: number; pageSize: number; pageCount: number };
}
