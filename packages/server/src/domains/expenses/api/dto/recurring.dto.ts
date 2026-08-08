import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, ValidateNested } from "class-validator";
import { EXP_VOUCHER_METHODS, EXP_VOUCHER_PAYEE_TYPES } from "../../domain/exp-voucher.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class RecurringTemplateDto {
  @ApiProperty({ enum: EXP_VOUCHER_PAYEE_TYPES })
  @IsIn(EXP_VOUCHER_PAYEE_TYPES)
  payeeType!: "SUPPLIER" | "STAFF" | "OTHER";

  @ApiProperty({ type: Object })
  @IsObject()
  payeeRef!: Record<string, unknown>;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  costCenterId?: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiProperty({ enum: EXP_VOUCHER_METHODS })
  @IsIn(EXP_VOUCHER_METHODS)
  method!: "CASH" | "BANK" | "PETTY_CASH" | "MPESA" | "CHEQUE";

  @ApiProperty()
  @IsString()
  narrative!: string;
}

export class CreateRecurringDto {
  @ApiProperty({ type: RecurringTemplateDto })
  @ValidateNested()
  @Type(() => RecurringTemplateDto)
  template!: RecurringTemplateDto;

  @ApiProperty({ description: "5-field cron subset: 'minute hour day-of-month month day-of-week', exact-value-or-'*' only, e.g. '0 0 1 * *' for monthly" })
  @IsString()
  scheduleCron!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString()
  nextRunOn!: string;
}

export class UpdateRecurringDto {
  @ApiPropertyOptional({ type: RecurringTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringTemplateDto)
  template?: RecurringTemplateDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleCron?: string;

  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsDateString()
  nextRunOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RecurringResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: RecurringTemplateDto })
  template!: Record<string, unknown>;

  @ApiProperty()
  scheduleCron!: string;

  @ApiProperty({ type: String, format: "date" })
  nextRunOn!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  lastVoucherId!: string | null;

  @ApiProperty()
  isActive!: boolean;
}

export class RunDueDto {
  @ApiPropertyOptional({ type: String, format: "date", description: "Defaults to today (UTC) if omitted" })
  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}

export class RunDueResultDto {
  @ApiProperty({ format: "uuid" })
  recurringId!: string;

  @ApiProperty({ format: "uuid" })
  voucherId!: string;

  @ApiProperty({ type: String, format: "date" })
  nextRunOn!: string;
}
