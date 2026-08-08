import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { FA_MAINTENANCE_KINDS, FaMaintenanceKind } from "../../domain/fa-maintenance.entity";

export class ScheduleFaMaintenanceDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  assetId!: string;

  @ApiProperty({ enum: FA_MAINTENANCE_KINDS })
  @IsIn(FA_MAINTENANCE_KINDS)
  kind!: FaMaintenanceKind;

  @ApiPropertyOptional({ type: String, format: "date", nullable: true })
  @IsOptional()
  @IsDateString()
  scheduledOn?: string;

  @ApiPropertyOptional({ description: "Defaults to '' (filled in progressively / at complete())" })
  @IsOptional()
  @IsString()
  downtimeNote?: string;
}

export class CompleteFaMaintenanceDto {
  @ApiProperty({ type: String, format: "date" })
  @IsDateString()
  doneOn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  downtimeNote?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "An ALREADY-CREATED exp_voucher id — this service never creates one itself" })
  @IsOptional()
  @IsUUID()
  costExpenseVoucherId?: string;
}

export class FaMaintenanceResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  assetId!: string;

  @ApiProperty({ enum: FA_MAINTENANCE_KINDS })
  kind!: string;

  @ApiProperty({ type: String, format: "date", nullable: true })
  scheduledOn!: string | null;

  @ApiProperty({ type: String, format: "date", nullable: true })
  doneOn!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  costExpenseVoucherId!: string | null;

  @ApiProperty()
  downtimeNote!: string;
}
