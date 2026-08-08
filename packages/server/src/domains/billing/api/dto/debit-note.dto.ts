import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsString, IsUUID, Matches, MaxLength, ValidateNested } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateDebitNoteLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  feeCategoryId!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class CreateDebitNoteDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiProperty({ type: [CreateDebitNoteLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateDebitNoteLineDto)
  lines!: CreateDebitNoteLineDto[];

  @ApiProperty()
  @IsString()
  reason!: string;
}

export class DebitNoteResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  termId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  invoiceId!: string | null;

  @ApiProperty()
  reason!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;
}

export class DebitNoteLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  debitNoteId!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: "uuid" })
  feeCategoryId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;
}
