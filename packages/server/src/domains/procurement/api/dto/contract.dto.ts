import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Min, MaxLength } from "class-validator";
import { PROC_CONTRACT_STATUSES } from "../../domain/proc-contract.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateContractDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiProperty()
  @IsDateString()
  startsOn!: string;

  @ApiProperty()
  @IsDateString()
  endsOn!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  value?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  renewalAlertDays?: number;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  documentFileId?: string;
}

export class UpdateContractDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  renewalAlertDays?: number;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  documentFileId?: string;
}

export class ContractResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  supplierId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  startsOn!: string;

  @ApiProperty()
  endsOn!: string;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  value!: string | null;

  @ApiProperty()
  renewalAlertDays!: number;

  @ApiProperty({ format: "uuid", nullable: true })
  documentFileId!: string | null;

  @ApiProperty({ enum: PROC_CONTRACT_STATUSES })
  status!: string;
}
