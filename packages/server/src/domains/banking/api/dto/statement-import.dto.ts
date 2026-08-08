import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString, IsUUID } from "class-validator";

export class BankStatementColumnMapDto {
  @ApiProperty({ description: "Raw column/key name carrying the line date" })
  @IsString()
  date!: string;

  @ApiProperty({ description: "Raw column/key name carrying the line description" })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: "SEPARATE_COLUMNS only" })
  @IsOptional()
  @IsString()
  debit?: string;

  @ApiPropertyOptional({ description: "SEPARATE_COLUMNS only" })
  @IsOptional()
  @IsString()
  credit?: string;

  @ApiPropertyOptional({ description: "SIGNED_AMOUNT only" })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({ description: "External reference column, if present" })
  @IsOptional()
  @IsString()
  ref?: string;
}

export class BankStatementMappingTemplateDto {
  @ApiProperty({ type: BankStatementColumnMapDto })
  @IsObject()
  columnMap!: BankStatementColumnMapDto;

  @ApiProperty({ description: 'Token template built from YYYY/MM/DD, e.g. "YYYY-MM-DD" or "DD/MM/YYYY"' })
  @IsString()
  dateFormat!: string;

  @ApiProperty({ enum: ["SEPARATE_COLUMNS", "SIGNED_AMOUNT"] })
  @IsIn(["SEPARATE_COLUMNS", "SIGNED_AMOUNT"])
  debitCreditConvention!: "SEPARATE_COLUMNS" | "SIGNED_AMOUNT";
}

export class ImportBankStatementLinesDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  fileId!: string;

  @ApiProperty({ type: BankStatementMappingTemplateDto })
  @IsObject()
  mappingTemplate!: BankStatementMappingTemplateDto;

  @ApiProperty({ type: [Object], description: "Flat rows already parsed from the source file (CSV/XLSX parsing is out of this endpoint's scope)" })
  rawRows!: Array<Record<string, unknown>>;
}

export class ImportBankStatementLinesResponseDto {
  @ApiProperty({ format: "uuid" })
  importId!: string;

  @ApiProperty()
  insertedCount!: number;

  @ApiProperty()
  duplicateCount!: number;
}

export class BankStatementImportResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  accountId!: string;

  @ApiProperty({ format: "uuid" })
  fileId!: string;

  @ApiProperty({ type: Object })
  mappingTemplate!: Record<string, unknown>;

  @ApiProperty({ type: Date })
  importedAt!: Date;

  @ApiProperty()
  lineCount!: number;

  @ApiProperty()
  duplicateCount!: number;
}
