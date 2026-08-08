import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateCreditNoteLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  feeCategoryId!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class CreateCreditNoteDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ type: [CreateCreditNoteLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateCreditNoteLineDto)
  lines!: CreateCreditNoteLineDto[];

  @ApiProperty()
  @IsString()
  reason!: string;
}

export class DecideCreditNoteDto {
  @ApiProperty()
  approved!: boolean;
}

export class CreditNoteResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  invoiceId!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;
}

export class CreditNoteLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  creditNoteId!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: "uuid" })
  feeCategoryId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;
}
