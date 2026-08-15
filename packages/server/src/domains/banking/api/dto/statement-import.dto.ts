import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID } from "class-validator";

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

  // Phase 6 Slice 21 Part 3 (Statement Import frontend) — real, confirmed bug
  // fix found via live verification, not a frontend-only concern: this field
  // previously carried ZERO class-validator decorators. The app's global
  // `ValidationPipe` (`apps/api/src/app.module.ts`) runs with
  // `whitelist: true`, which strips any `@Body()` property that has no
  // validation decorator at all from the transformed DTO instance BEFORE the
  // controller ever sees it — so `dto.rawRows` was always `undefined` at
  // runtime, and `BankStatementImportService.importLines()`'s own
  // `input.rawRows.map(...)` crashed with a real 500
  // ("Cannot read properties of undefined (reading 'map')") on every single
  // call, confirmed live against the running API with a real, well-formed
  // request body before this fix. `@IsArray()` alone is enough to make
  // whitelist retain the property; no nested-shape validation is added here
  // (each row is a genuinely arbitrary `Record<string, unknown>` keyed by
  // whatever headers the source file happened to have — there is no fixed
  // shape to validate against).
  @ApiProperty({ type: [Object], description: "Flat rows already parsed from the source file (CSV/XLSX parsing is out of this endpoint's scope)" })
  @IsArray()
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
