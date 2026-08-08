import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsISO8601, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateScheduleDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  reportCode!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  params!: Record<string, unknown>;

  @ApiProperty({ maxLength: 30, description: '5-field cron subset — "minute hour day-of-month month day-of-week", each "*" or an exact integer' })
  @IsString()
  @MaxLength(30)
  cron!: string;

  @ApiProperty({ type: [String], description: "Raw email addresses — non-email entries are skipped at delivery time" })
  recipients!: unknown;

  @ApiProperty({ enum: ["PDF", "XLSX", "CSV"] })
  @IsIn(["PDF", "XLSX", "CSV"])
  format!: "PDF" | "XLSX" | "CSV";
}

export class UpdateScheduleDto {
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cron?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  recipients?: unknown;

  @ApiPropertyOptional({ enum: ["PDF", "XLSX", "CSV"] })
  @IsOptional()
  @IsIn(["PDF", "XLSX", "CSV"])
  format?: "PDF" | "XLSX" | "CSV";

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ScheduleResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  reportCode!: string;

  @ApiProperty({ type: Object })
  params!: Record<string, unknown>;

  @ApiProperty()
  cron!: string;

  @ApiProperty({ type: Object })
  recipients!: unknown;

  @ApiProperty({ enum: ["PDF", "XLSX", "CSV"] })
  format!: string;

  @ApiProperty({ format: "uuid" })
  ownerUserId!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastRunAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastOk!: boolean | null;
}

export class RunDueDto {
  @ApiPropertyOptional({ type: String, format: "date", description: "Defaults to today (server UTC date)" })
  @IsOptional()
  @IsISO8601({ strict: true })
  asOfDate?: string;
}
