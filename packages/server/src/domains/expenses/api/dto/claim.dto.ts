import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { EXP_CLAIM_REIMBURSE_VIA, EXP_CLAIM_STATUSES } from "../../domain/exp-claim.entity";
import { EXP_VOUCHER_METHODS } from "../../domain/exp-voucher.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateClaimDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  staffUserId!: string;

  @ApiProperty({ enum: EXP_CLAIM_REIMBURSE_VIA })
  @IsIn(EXP_CLAIM_REIMBURSE_VIA)
  reimburseVia!: "PAYROLL" | "DIRECT";
}

export class AddClaimLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString()
  expenseDate!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  receiptFileId?: string;
}

export class UpdateClaimLineDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  amount?: string;

  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  receiptFileId?: string | null;
}

export class ReimburseClaimDto {
  @ApiPropertyOptional({ enum: EXP_VOUCHER_METHODS, description: "Required when reimburse_via=DIRECT" })
  @IsOptional()
  @IsIn(EXP_VOUCHER_METHODS)
  method?: "CASH" | "BANK" | "PETTY_CASH" | "MPESA" | "CHEQUE";
}

export class ClaimResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  staffUserId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ enum: EXP_CLAIM_STATUSES })
  status!: string;

  @ApiProperty({ enum: EXP_CLAIM_REIMBURSE_VIA })
  reimburseVia!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;
}

export class ClaimLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  claimId!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: "uuid" })
  categoryId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ type: String, format: "date" })
  expenseDate!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  receiptFileId!: string | null;
}
