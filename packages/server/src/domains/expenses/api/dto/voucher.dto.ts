import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { EXP_VOUCHER_METHODS, EXP_VOUCHER_PAYEE_TYPES, EXP_VOUCHER_STATUSES } from "../../domain/exp-voucher.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateVoucherDto {
  @ApiProperty({ enum: EXP_VOUCHER_PAYEE_TYPES })
  @IsIn(EXP_VOUCHER_PAYEE_TYPES)
  payeeType!: "SUPPLIER" | "STAFF" | "OTHER";

  @ApiProperty({ type: Object, description: "Polymorphic payee identity, shape depends on payeeType" })
  @IsObject()
  payeeRef!: Record<string, unknown>;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  costCenterId?: string;

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

export class UpdateVoucherDto {
  @ApiPropertyOptional({ enum: EXP_VOUCHER_PAYEE_TYPES })
  @IsOptional()
  @IsIn(EXP_VOUCHER_PAYEE_TYPES)
  payeeType?: "SUPPLIER" | "STAFF" | "OTHER";

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  payeeRef?: Record<string, unknown>;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  costCenterId?: string | null;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  amount?: string;

  @ApiPropertyOptional({ enum: EXP_VOUCHER_METHODS })
  @IsOptional()
  @IsIn(EXP_VOUCHER_METHODS)
  method?: "CASH" | "BANK" | "PETTY_CASH" | "MPESA" | "CHEQUE";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  narrative?: string;
}

export class VoucherResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ enum: EXP_VOUCHER_PAYEE_TYPES })
  payeeType!: string;

  @ApiProperty({ type: Object })
  payeeRef!: Record<string, unknown>;

  @ApiProperty({ format: "uuid" })
  categoryId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  costCenterId!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ enum: EXP_VOUCHER_METHODS })
  method!: string;

  @ApiProperty()
  narrative!: string;

  @ApiProperty({ enum: EXP_VOUCHER_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}
