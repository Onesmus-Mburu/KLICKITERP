import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

/** `Money.fromDecimalString`'s accepted shape — matches this codebase's convention for decimal-string monetary DTO fields. */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export class JournalLineInputDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  accountId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @ApiProperty({ type: String, description: "Decimal string — exactly one of debit/credit must be nonzero" })
  @Matches(DECIMAL_PATTERN)
  debit!: string;

  @ApiProperty({ type: String, description: "Decimal string — exactly one of debit/credit must be nonzero" })
  @Matches(DECIMAL_PATTERN)
  credit!: string;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;

  @ApiPropertyOptional({ maxLength: 30, nullable: true, description: "Sub-ledger link type, e.g. bill_invoice_line" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  entityRefType?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Sub-ledger link id" })
  @IsOptional()
  @IsUUID()
  entityRefId?: string;
}
