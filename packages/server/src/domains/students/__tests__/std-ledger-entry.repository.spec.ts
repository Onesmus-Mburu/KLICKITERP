import { EntityManager } from "typeorm";
import { StdLedgerEntryRepository } from "../infrastructure/std-ledger-entry.repository";

describe("StdLedgerEntryRepository.getStatementWithRunningBalance — window-function query construction", () => {
  it("issues a SUM(debit - credit) OVER (PARTITION BY student_id ORDER BY posted_at, id) window query, scoped to the student", async () => {
    const queryMock = jest.fn(async (_sql: string, _params?: unknown[]) => [
      {
        id: "entry-1",
        student_id: "student-1",
        entry_date: "2026-01-15",
        posted_at: new Date("2026-01-15T10:00:00Z"),
        doc_type: "INVOICE",
        doc_id: "doc-1",
        doc_number: "INV-001",
        debit: "100.0000",
        credit: "0.0000",
        memo: null,
        running_balance: "100.0000",
      },
    ]);
    const em = { query: queryMock } as unknown as EntityManager;
    const repo = new StdLedgerEntryRepository({ manager: em } as never);

    const rows = await repo.getStatementWithRunningBalance("student-1", em);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SUM(debit - credit) OVER (PARTITION BY student_id ORDER BY posted_at, id)");
    expect(sql).toContain("WHERE student_id = $1");
    expect(params).toEqual(["student-1"]);

    expect(rows).toHaveLength(1);
    expect(rows[0].runningBalance.toDecimalString()).toBe("100.0000");
    expect(rows[0].debit.toDecimalString()).toBe("100.0000");
  });
});
