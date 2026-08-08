import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GL_JOURNAL_TYPES } from "../../domain/gl-journal.entity";

export class JournalLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  journalId!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: "uuid" })
  accountId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  costCenterId!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  debit!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  credit!: string;

  @ApiPropertyOptional({ nullable: true })
  memo!: string | null;

  @ApiPropertyOptional({ nullable: true })
  entityRefType!: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  entityRefId!: string | null;
}

export class JournalResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 30 })
  number!: string;

  @ApiProperty({ type: String, format: "date" })
  journalDate!: string;

  @ApiProperty({ format: "uuid" })
  periodId!: string;

  @ApiProperty({ maxLength: 20 })
  sourceModule!: string;

  @ApiProperty({ maxLength: 30 })
  sourceDocType!: string;

  @ApiProperty({ format: "uuid" })
  sourceDocId!: string;

  @ApiProperty()
  narration!: string;

  @ApiProperty({ enum: GL_JOURNAL_TYPES })
  journalType!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  reversalOfId!: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid" })
  postedBy!: string;

  @ApiProperty()
  postedAt!: Date;

  @ApiPropertyOptional({ type: [JournalLineResponseDto] })
  lines?: JournalLineResponseDto[];
}
