import type { LedgerStatementRowDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `StudentLedgerController` — READ-ONLY, no write path
 * exists anywhere for `std_ledger_entry` via HTTP (it's appended only from
 * inside other modules' own posting transactions, per that controller's own
 * doc comment). `debit`/`credit`/`runningBalance` are decimal strings,
 * display-only via `formatMoney()` — never fed through `<MoneyInput>`.
 */
export async function getStudentLedgerStatement(studentId: string): Promise<LedgerStatementRowDto[]> {
  return unwrapApiResult<LedgerStatementRowDto[]>(
    await apiClient.GET("/api/v1/students/{id}/ledger", { params: { path: { id: studentId } } }),
  );
}
