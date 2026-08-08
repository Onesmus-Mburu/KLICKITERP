import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { BankStatementImportService } from "../application/bank-statement-import.service";
import { BankStatementImportEntity } from "../domain/bank-statement-import.entity";
import {
  BankStatementImportResponseDto,
  ImportBankStatementLinesDto,
  ImportBankStatementLinesResponseDto,
} from "./dto/statement-import.dto";

function toView(entity: BankStatementImportEntity): BankStatementImportResponseDto {
  return {
    id: entity.id,
    accountId: entity.accountId,
    fileId: entity.fileId,
    mappingTemplate: entity.mappingTemplate,
    importedAt: entity.importedAt,
    lineCount: entity.lineCount,
    duplicateCount: entity.duplicateCount,
  };
}

/** FR-BANK-003.1 — bank statement import with per-bank saved mapping templates and dedupe-on-reimport. */
@ApiTags("banking-statement-import")
@Controller("banking/statement-imports")
export class StatementImportController {
  constructor(
    private readonly statementImportService: BankStatementImportService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("banking:statement:import")
  @ApiOperation({ summary: "Import bank statement lines against a saved mapping template (dedupe-on-reimport via BR-BANK-02's hash)" })
  @ApiResponse({ status: 201, type: ImportBankStatementLinesResponseDto })
  async importLines(@Body() dto: ImportBankStatementLinesDto): Promise<ImportBankStatementLinesResponseDto> {
    const result = await runInTransaction(this.dataSource, (manager) =>
      this.statementImportService.importLines(manager, {
        accountId: dto.accountId,
        fileId: dto.fileId,
        mappingTemplate: dto.mappingTemplate,
        rawRows: dto.rawRows,
      }),
    );
    return {
      importId: result.import.id,
      insertedCount: result.insertedCount,
      duplicateCount: result.duplicateCount,
    };
  }

  @Get()
  @RequirePermission("banking:statement:import")
  @ApiOperation({ summary: "List statement import runs, optionally filtered by accountId" })
  @ApiResponse({ status: 200, type: [BankStatementImportResponseDto] })
  async list(@Query("accountId") accountId?: string): Promise<BankStatementImportResponseDto[]> {
    return (await this.statementImportService.list(accountId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:statement:import")
  @ApiOperation({ summary: "Get a statement import run by id" })
  @ApiResponse({ status: 200, type: BankStatementImportResponseDto })
  async findOne(@Param("id") id: string): Promise<BankStatementImportResponseDto> {
    return toView(await this.statementImportService.findByIdOrFail(id));
  }
}
