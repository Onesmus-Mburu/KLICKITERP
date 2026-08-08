import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { StudentLedgerService } from "../application/student-ledger.service";
import { LedgerStatementRowDto } from "./dto/ledger-statement-response.dto";

/**
 * READ-ONLY — `std_ledger_entry` is written exclusively via
 * `StudentLedgerService.appendEntry()`, called from inside other modules'
 * (future Billing/Payments) own posting transactions, never through HTTP.
 * Registered before `StudentsController` in `students.module.ts` so this
 * controller's `students/:id/ledger` route isn't relevant to the ordering
 * concern (3 segments, no collision with `students/:id`), but kept
 * consistent with the rest of this module's registration-order discipline.
 */
@ApiTags("students-ledger")
@Controller("students")
export class StudentLedgerController {
  constructor(private readonly studentLedgerService: StudentLedgerService) {}

  @Get(":id/ledger")
  @RequirePermission("students:ledger:view")
  @ApiOperation({ summary: "Student sub-ledger statement with a computed running balance" })
  @ApiResponse({ status: 200, type: [LedgerStatementRowDto] })
  async getStatement(@Param("id") id: string): Promise<LedgerStatementRowDto[]> {
    const rows = await this.studentLedgerService.getStatement(id);
    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      entryDate: row.entryDate,
      postedAt: row.postedAt,
      docType: row.docType,
      docId: row.docId,
      docNumber: row.docNumber,
      debit: row.debit.toDecimalString(),
      credit: row.credit.toDecimalString(),
      memo: row.memo,
      runningBalance: row.runningBalance.toDecimalString(),
    }));
  }
}
