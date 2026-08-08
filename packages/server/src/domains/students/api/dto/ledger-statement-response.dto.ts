import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LedgerStatementRowDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: String, format: "date" })
  entryDate!: string;

  @ApiProperty({ type: String, format: "date-time" })
  postedAt!: Date;

  @ApiProperty({ maxLength: 30 })
  docType!: string;

  @ApiProperty({ format: "uuid" })
  docId!: string;

  @ApiProperty({ maxLength: 30 })
  docNumber!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  debit!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  credit!: string;

  @ApiPropertyOptional({ nullable: true })
  memo!: string | null;

  @ApiProperty({ type: String, description: "Decimal string — computed by window function, never stored" })
  runningBalance!: string;
}
