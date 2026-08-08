import { AgingOutstandingReport } from "../application/aging-outstanding.report";
import { Money } from "../../../shared/money/money";
import type { BillInvoiceEntity, BillInvoiceRepository } from "../../billing";
import type { StdStudentEntity, StdStudentRepository } from "../../students";

function daysBefore(asOfDate: string, days: number): string {
  const ms = Date.parse(`${asOfDate}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "inv",
    studentId: "student-1",
    dueDate: "2026-01-01",
    balance: Money.ZERO,
    status: "POSTED",
    ...overrides,
  } as BillInvoiceEntity;
}

function makeStudent(overrides: Partial<StdStudentEntity>): StdStudentEntity {
  return {
    id: "student-1",
    admissionNo: "ADM-001",
    firstName: "Jane",
    lastName: "Doe",
    classId: "class-1",
    ...overrides,
  } as StdStudentEntity;
}

describe("AgingOutstandingReport", () => {
  let billInvoiceRepository: { findAllOpen: jest.Mock };
  let studentRepository: { findById: jest.Mock };
  let report: AgingOutstandingReport;

  beforeEach(() => {
    billInvoiceRepository = { findAllOpen: jest.fn(async () => []) };
    studentRepository = { findById: jest.fn(async (id: string) => makeStudent({ id })) };
    report = new AgingOutstandingReport(
      billInvoiceRepository as unknown as BillInvoiceRepository,
      studentRepository as unknown as StdStudentRepository,
    );
  });

  it("assigns invoices to the exact 4 aging buckets at their day-count boundaries, folding not-yet-due invoices into 0-30", async () => {
    const asOfDate = "2026-07-20";
    billInvoiceRepository.findAllOpen.mockResolvedValue([
      makeInvoice({ id: "due-30", dueDate: daysBefore(asOfDate, 30), balance: Money.fromInt(100) }), // exactly 30 -> 0-30
      makeInvoice({ id: "due-31", dueDate: daysBefore(asOfDate, 31), balance: Money.fromInt(200) }), // exactly 31 -> 31-60
      makeInvoice({ id: "due-60", dueDate: daysBefore(asOfDate, 60), balance: Money.fromInt(300) }), // exactly 60 -> 31-60
      makeInvoice({ id: "due-61", dueDate: daysBefore(asOfDate, 61), balance: Money.fromInt(400) }), // exactly 61 -> 61-90
      makeInvoice({ id: "due-90", dueDate: daysBefore(asOfDate, 90), balance: Money.fromInt(500) }), // exactly 90 -> 61-90
      makeInvoice({ id: "due-91", dueDate: daysBefore(asOfDate, 91), balance: Money.fromInt(600) }), // exactly 91 -> 90+
      makeInvoice({ id: "not-yet-due", dueDate: daysBefore(asOfDate, -10), balance: Money.fromInt(700) }), // future -> 0-30
    ]);

    const result = await report.execute({ asOfDate });

    expect(result.rows).toHaveLength(1); // all one student
    const row = result.rows[0] as {
      bucket0to30: Money;
      bucket31to60: Money;
      bucket61to90: Money;
      bucket90plus: Money;
      total: Money;
    };
    expect(row.bucket0to30.toDecimalString()).toBe("800.0000"); // 100 + 700
    expect(row.bucket31to60.toDecimalString()).toBe("500.0000"); // 200 + 300
    expect(row.bucket61to90.toDecimalString()).toBe("900.0000"); // 400 + 500
    expect(row.bucket90plus.toDecimalString()).toBe("600.0000");
    expect(row.total.toDecimalString()).toBe("2800.0000");

    const totals = result.totals as { bucket0to30: Money; bucket31to60: Money; bucket61to90: Money; bucket90plus: Money; grandTotal: Money };
    expect(totals.bucket0to30.toDecimalString()).toBe("800.0000");
    expect(totals.grandTotal.toDecimalString()).toBe("2800.0000");
  });

  it("groups by student with per-student totals, and a grand total across all students, sorted by total descending", async () => {
    const asOfDate = "2026-07-20";
    billInvoiceRepository.findAllOpen.mockResolvedValue([
      makeInvoice({ id: "s1-inv", studentId: "student-1", dueDate: daysBefore(asOfDate, 10), balance: Money.fromInt(500) }),
      makeInvoice({ id: "s2-inv-a", studentId: "student-2", dueDate: daysBefore(asOfDate, 10), balance: Money.fromInt(1000) }),
      makeInvoice({ id: "s2-inv-b", studentId: "student-2", dueDate: daysBefore(asOfDate, 95), balance: Money.fromInt(2000) }),
    ]);
    studentRepository.findById.mockImplementation(async (id: string) =>
      id === "student-1"
        ? makeStudent({ id: "student-1", admissionNo: "ADM-001", firstName: "Jane", lastName: "Doe" })
        : makeStudent({ id: "student-2", admissionNo: "ADM-002", firstName: "John", lastName: "Smith" }),
    );

    const result = await report.execute({ asOfDate });

    expect(result.rows).toHaveLength(2);
    // student-2 has the larger total (3000) and must sort first.
    const [first, second] = result.rows as Array<{ studentId: string; total: Money; admissionNo: string }>;
    expect(first.studentId).toBe("student-2");
    expect(first.total.toDecimalString()).toBe("3000.0000");
    expect(second.studentId).toBe("student-1");
    expect(second.total.toDecimalString()).toBe("500.0000");

    const totals = result.totals as { grandTotal: Money };
    expect(totals.grandTotal.toDecimalString()).toBe("3500.0000");
  });

  it("defaults asOfDate to today when omitted", async () => {
    // A due date far enough in the past to land in the 90+ bucket regardless of which real calendar day the test runs on.
    billInvoiceRepository.findAllOpen.mockResolvedValue([
      makeInvoice({ id: "ancient", studentId: "student-1", dueDate: "2000-01-01", balance: Money.fromInt(100) }),
    ]);

    const result = await report.execute({});

    const row = result.rows[0] as { bucket90plus: Money; total: Money };
    expect(row.bucket90plus.toDecimalString()).toBe("100.0000");
    expect(row.total.toDecimalString()).toBe("100.0000");
  });
});
