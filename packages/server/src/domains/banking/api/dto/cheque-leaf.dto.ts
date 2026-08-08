import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { BANK_CHEQUE_LEAF_STATUSES } from "../../domain/bank-cheque-leaf.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class IssueChequeLeafDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  bookId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  voucherId?: string;

  @ApiProperty()
  @IsString()
  payee!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class ReasonDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class BankChequeLeafResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  bookId!: string;

  @ApiProperty()
  leafNo!: number;

  @ApiProperty({ enum: BANK_CHEQUE_LEAF_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  voucherId!: string | null;

  @ApiProperty({ nullable: true })
  payee!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  amount!: string | null;

  @ApiProperty({ nullable: true })
  issuedOn!: string | null;

  @ApiProperty({ nullable: true })
  statusReason!: string | null;
}
