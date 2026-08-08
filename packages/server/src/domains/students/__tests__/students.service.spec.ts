import { DataSource } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { StudentsService } from "../application/students.service";
import { StdStudentEntity } from "../domain/std-student.entity";

function makeStudent(overrides: Partial<StdStudentEntity> = {}): StdStudentEntity {
  return {
    id: "student-1",
    admissionNo: "ADM-001",
    firstName: "Jane",
    middleName: null,
    lastName: "Doe",
    searchName: "jane doe",
    classId: "class-1",
    streamId: null,
    status: "ACTIVE",
    boarding: "DAY",
    feeGroupId: null,
    sponsorId: null,
    transportRouteId: null,
    photoFileId: null,
    customFields: {},
    enrolledOn: "2026-01-01",
    exitedOn: null,
    exitCleared: false,
    ...overrides,
  } as StdStudentEntity;
}

describe("StudentsService", () => {
  let studentRepository: {
    findByIdOrFail: jest.Mock;
    findByAdmissionNo: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    list: jest.Mock;
    searchByNameOrAdmissionNo: jest.Mock;
    delete: jest.Mock;
    countInvoiceReferences: jest.Mock;
    countDebitNoteReferences: jest.Mock;
    countRefundVoucherReferences: jest.Mock;
    countSponsorAwardReferences: jest.Mock;
    countConcessionReferences: jest.Mock;
    countOptionalItemReferences: jest.Mock;
    countReceiptReferences: jest.Mock;
    countBulkAllocationLineReferences: jest.Mock;
    countWalletReferences: jest.Mock;
  };
  let classRepository: { findByIdOrFail: jest.Mock };
  let streamRepository: { findByIdOrFail: jest.Mock };
  let feeGroupRepository: { findByIdOrFail: jest.Mock };
  let ledgerEntryRepository: { countByStudentId: jest.Mock };
  let studentGuardianRepository: { deleteByStudentId: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let settingsService: { get: jest.Mock; set: jest.Mock };
  let numberingService: { allocate: jest.Mock; upsertSeriesPrefix: jest.Mock };
  let dataSource: DataSource;
  let service: StudentsService;

  beforeEach(() => {
    studentRepository = {
      findByIdOrFail: jest.fn(async () => makeStudent()),
      findByAdmissionNo: jest.fn(async () => null),
      save: jest.fn(async (e) => e),
      create: jest.fn(async (d) => ({ ...d, id: "student-new" })),
      list: jest.fn(async () => [[], 0]),
      searchByNameOrAdmissionNo: jest.fn(async () => []),
      delete: jest.fn(async () => undefined),
      countInvoiceReferences: jest.fn(async () => 0),
      countDebitNoteReferences: jest.fn(async () => 0),
      countRefundVoucherReferences: jest.fn(async () => 0),
      countSponsorAwardReferences: jest.fn(async () => 0),
      countConcessionReferences: jest.fn(async () => 0),
      countOptionalItemReferences: jest.fn(async () => 0),
      countReceiptReferences: jest.fn(async () => 0),
      countBulkAllocationLineReferences: jest.fn(async () => 0),
      countWalletReferences: jest.fn(async () => 0),
    };
    classRepository = { findByIdOrFail: jest.fn(async () => ({ id: "class-1" })) };
    streamRepository = { findByIdOrFail: jest.fn(async () => ({ id: "stream-1" })) };
    feeGroupRepository = { findByIdOrFail: jest.fn(async () => ({ id: "fg-1" })) };
    ledgerEntryRepository = { countByStudentId: jest.fn(async () => 0) };
    studentGuardianRepository = { deleteByStudentId: jest.fn(async () => undefined) };
    outboxWriter = { write: jest.fn(async () => undefined) };
    settingsService = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
    numberingService = {
      allocate: jest.fn(async () => "ADM-000001"),
      upsertSeriesPrefix: jest.fn(async () => ({})),
    };

    // Fake DataSource.transaction() that just invokes work() with a stub manager — mirrors the
    // pattern used across this codebase's other unit specs for services that call runInTransaction.
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (m: unknown) => Promise<unknown>) => work({})),
    } as unknown as DataSource;

    service = new StudentsService(
      dataSource,
      studentRepository as never,
      classRepository as never,
      streamRepository as never,
      feeGroupRepository as never,
      ledgerEntryRepository as never,
      studentGuardianRepository as never,
      outboxWriter as unknown as OutboxWriterService,
      settingsService as never,
      numberingService as never,
    );
  });

  describe("list — real server-side pagination (Phase 6 Slice 2c)", () => {
    it("defaults to page 1 / pageSize 20 (skip:0, take:20) when no page/pageSize is given", async () => {
      await service.list({});
      expect(studentRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it("page 1 converts to skip:0 — the exact same skip/take shape UsersService.list() uses", async () => {
      await service.list({ page: 1, pageSize: 10 });
      expect(studentRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it("page 2 converts to skip:pageSize (returns different rows than page 1, by construction of skip)", async () => {
      await service.list({ page: 2, pageSize: 10 });
      expect(studentRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it("page 3 at pageSize 25 converts to skip:50", async () => {
      await service.list({ page: 3, pageSize: 25 });
      expect(studentRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 25 }),
      );
    });

    it("returns the real total count from the repository, not the page's row count", async () => {
      const rows = [makeStudent({ id: "s1" }), makeStudent({ id: "s2" })];
      studentRepository.list.mockResolvedValue([rows, 47]);

      const result = await service.list({ page: 1, pageSize: 2 });

      expect(result.items).toBe(rows);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(47);
    });

    it("page 1 and page 2 return different rows when the repository mock reflects real pagination", async () => {
      studentRepository.list.mockImplementation(async (filter: { skip?: number; take?: number }) => {
        const all = Array.from({ length: 25 }, (_, i) => makeStudent({ id: `s${i + 1}`, admissionNo: `ADM-${String(i + 1).padStart(3, "0")}` }));
        const skip = filter.skip ?? 0;
        const take = filter.take ?? 20;
        return [all.slice(skip, skip + take), all.length];
      });

      const page1 = await service.list({ page: 1, pageSize: 10 });
      const page2 = await service.list({ page: 2, pageSize: 10 });

      expect(page1.items.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"]);
      expect(page2.items.map((s) => s.id)).toEqual(["s11", "s12", "s13", "s14", "s15", "s16", "s17", "s18", "s19", "s20"]);
      expect(page1.items).not.toEqual(page2.items);
      expect(page1.total).toBe(25);
      expect(page2.total).toBe(25);
    });

    it("combines classId/status filters with pagination in the same repository call", async () => {
      await service.list({ classId: "class-1", status: "ACTIVE", page: 2, pageSize: 5 });
      expect(studentRepository.list).toHaveBeenCalledWith({
        classId: "class-1",
        status: "ACTIVE",
        skip: 5,
        take: 5,
      });
    });

    it("a class filter combined with pagination still returns only that class's real total (not paginated away)", async () => {
      studentRepository.list.mockImplementation(async (filter: { classId?: string }) => {
        if (filter.classId === "class-3") {
          return [[makeStudent({ id: "a" }), makeStudent({ id: "b" }), makeStudent({ id: "c" })], 3];
        }
        return [[], 0];
      });

      const result = await service.list({ classId: "class-3", page: 1, pageSize: 10 });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });
  });

  describe("changeStatus — exit-clearance gate (BR-BILL-15 / trg_std_student_exit_guard mirror)", () => {
    it("rejects ACTIVE -> ALUMNI when exit_cleared is false", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue(makeStudent({ status: "ACTIVE", exitCleared: false }));
      await expect(service.changeStatus("student-1", "ALUMNI", "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("rejects ACTIVE -> TRANSFERRED when exit_cleared is false", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue(makeStudent({ status: "ACTIVE", exitCleared: false }));
      await expect(service.changeStatus("student-1", "TRANSFERRED", "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("rejects ACTIVE -> WITHDRAWN when exit_cleared is false", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue(makeStudent({ status: "ACTIVE", exitCleared: false }));
      await expect(service.changeStatus("student-1", "WITHDRAWN", "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("allows ACTIVE -> ALUMNI once exit_cleared is true", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue(makeStudent({ status: "ACTIVE", exitCleared: true }));
      const result = await service.changeStatus("student-1", "ALUMNI", "actor-1");
      expect(result.status).toBe("ALUMNI");
      expect(result.exitedOn).not.toBeNull();
    });

    it("allows ACTIVE -> SUSPENDED regardless of exit_cleared (not an exit status)", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue(makeStudent({ status: "ACTIVE", exitCleared: false }));
      const result = await service.changeStatus("student-1", "SUSPENDED", "actor-1");
      expect(result.status).toBe("SUSPENDED");
    });

    it("does not re-check exit_cleared moving between two exit statuses", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue(
        makeStudent({ status: "SUSPENDED", exitCleared: false }),
      );
      // SUSPENDED is not an exit status, so this is a fresh entry into WITHDRAWN — must still be gated.
      await expect(service.changeStatus("student-1", "WITHDRAWN", "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("publishes StudentStatusChangedEvent via the outbox writer on a successful transition", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue(makeStudent({ status: "ACTIVE", exitCleared: true }));
      await service.changeStatus("student-1", "ALUMNI", "actor-1");
      expect(outboxWriter.write).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "students.student_status_changed" }),
      );
    });
  });

  describe("markExitCleared", () => {
    it("sets exit_cleared=true", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue(makeStudent({ exitCleared: false }));
      const result = await service.markExitCleared("student-1", "actor-1");
      expect(result.exitCleared).toBe(true);
    });
  });

  describe("search — FR-PAY-002", () => {
    it("delegates to the repository's trigram search with the given query/limit", async () => {
      await service.search("jane", 10);
      expect(studentRepository.searchByNameOrAdmissionNo).toHaveBeenCalledWith("jane", 10);
    });

    it("returns an empty array without querying the repository for a blank query", async () => {
      const result = await service.search("   ");
      expect(result).toEqual([]);
      expect(studentRepository.searchByNameOrAdmissionNo).not.toHaveBeenCalled();
    });

    it("returns results in the order the repository provides them (relevance-ranked upstream)", async () => {
      const ranked = [makeStudent({ id: "a" }), makeStudent({ id: "b" })];
      studentRepository.searchByNameOrAdmissionNo.mockResolvedValue(ranked);
      const result = await service.search("jane");
      expect(result.map((s) => s.id)).toEqual(["a", "b"]);
    });
  });

  describe("create", () => {
    it("rejects a duplicate admission_no", async () => {
      studentRepository.findByAdmissionNo.mockResolvedValue(makeStudent());
      await expect(
        service.create(
          {
            admissionNo: "ADM-001",
            firstName: "Jane",
            lastName: "Doe",
            classId: "class-1",
            boarding: "DAY",
            enrolledOn: "2026-01-01",
          },
          "actor-1",
        ),
      ).rejects.toThrow();
    });

    it("publishes StudentEnrolledEvent on success", async () => {
      await service.create(
        {
          admissionNo: "ADM-002",
          firstName: "John",
          lastName: "Smith",
          classId: "class-1",
          boarding: "BOARDER",
          enrolledOn: "2026-01-01",
        },
        "actor-1",
      );
      expect(outboxWriter.write).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "students.student_enrolled" }),
      );
    });

    it("defaults boarding to DAY when omitted (Phase 6 Slice 2b follow-up item 3)", async () => {
      const result = await service.create(
        {
          admissionNo: "ADM-003",
          firstName: "No",
          lastName: "Boarding",
          classId: "class-1",
          enrolledOn: "2026-01-01",
        },
        "actor-1",
      );
      expect(result.boarding).toBe("DAY");
    });

    it("still honors an explicitly-supplied boarding value (BOARDER) rather than always defaulting", async () => {
      const result = await service.create(
        {
          admissionNo: "ADM-004",
          firstName: "Explicit",
          lastName: "Boarder",
          classId: "class-1",
          boarding: "BOARDER",
          enrolledOn: "2026-01-01",
        },
        "actor-1",
      );
      expect(result.boarding).toBe("BOARDER");
    });
  });

  describe("create — admission-number autogen (Phase 6 Slice 2b item 8)", () => {
    it("rejects an omitted admissionNo when autogen is disabled (never configured)", async () => {
      settingsService.get.mockResolvedValue(null);
      await expect(
        service.create(
          { firstName: "Auto", lastName: "Disabled", classId: "class-1", boarding: "DAY", enrolledOn: "2026-01-01" },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(numberingService.allocate).not.toHaveBeenCalled();
      expect(studentRepository.findByAdmissionNo).not.toHaveBeenCalled();
    });

    it("rejects an omitted admissionNo when autogen is explicitly disabled", async () => {
      settingsService.get.mockResolvedValue({ enabled: false, prefix: "DSCS-" });
      await expect(
        service.create(
          { firstName: "Auto", lastName: "Disabled2", classId: "class-1", boarding: "DAY", enrolledOn: "2026-01-01" },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(numberingService.allocate).not.toHaveBeenCalled();
    });

    it("allocates via NumberingService inside the transaction when autogen is enabled and admissionNo is omitted", async () => {
      settingsService.get.mockResolvedValue({ enabled: true, prefix: "DSCS-" });
      numberingService.allocate.mockResolvedValue("DSCS-000001");

      const result = await service.create(
        { firstName: "Auto", lastName: "Enabled", classId: "class-1", boarding: "DAY", enrolledOn: "2026-01-01" },
        "actor-1",
      );

      expect(result.admissionNo).toBe("DSCS-000001");
      expect(numberingService.allocate).toHaveBeenCalledWith(expect.anything(), "STD_ADMISSION");
      // The freshly-allocated-number path skips the pre-transaction uniqueness pre-check by design
      // (a freshly allocated number cannot collide by construction) — see the service's own doc comment.
      expect(studentRepository.findByAdmissionNo).not.toHaveBeenCalled();
    });

    it("still performs the pre-transaction uniqueness check when admissionNo IS supplied, even with autogen enabled", async () => {
      settingsService.get.mockResolvedValue({ enabled: true, prefix: "DSCS-" });
      await service.create(
        {
          admissionNo: "ADM-EXPLICIT",
          firstName: "Explicit",
          lastName: "Number",
          classId: "class-1",
          boarding: "DAY",
          enrolledOn: "2026-01-01",
        },
        "actor-1",
      );
      expect(studentRepository.findByAdmissionNo).toHaveBeenCalledWith("ADM-EXPLICIT");
      expect(numberingService.allocate).not.toHaveBeenCalled();
    });
  });

  describe("admission-no-autogen setting get/set", () => {
    it("getAdmissionNoAutogenSetting returns the honest disabled default when never configured", async () => {
      settingsService.get.mockResolvedValue(null);
      const result = await service.getAdmissionNoAutogenSetting();
      expect(result).toEqual({ enabled: false, prefix: "" });
    });

    it("getAdmissionNoAutogenSetting returns the stored setting when configured", async () => {
      settingsService.get.mockResolvedValue({ enabled: true, prefix: "DSCS-" });
      const result = await service.getAdmissionNoAutogenSetting();
      expect(result).toEqual({ enabled: true, prefix: "DSCS-" });
    });

    it("setAdmissionNoAutogenSetting upserts both the setting AND the numbering series prefix", async () => {
      const result = await service.setAdmissionNoAutogenSetting({ enabled: true, prefix: "DSCS-" }, "actor-1");
      expect(settingsService.set).toHaveBeenCalledWith(
        "students.admissionNoAutogenSetting",
        { enabled: true, prefix: "DSCS-" },
        false,
        "actor-1",
      );
      expect(numberingService.upsertSeriesPrefix).toHaveBeenCalledWith("STD_ADMISSION", "DSCS-");
      expect(result).toEqual({ enabled: true, prefix: "DSCS-" });
    });
  });

  describe("delete — Phase 6 Slice 2b — Student delete", () => {
    it("deletes a clean student (zero financial references): auto-deletes guardian links then the student row, in one transaction", async () => {
      await service.delete("student-1", "actor-1");

      expect(studentRepository.findByIdOrFail).toHaveBeenCalledWith("student-1");
      expect(ledgerEntryRepository.countByStudentId).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countInvoiceReferences).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countDebitNoteReferences).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countRefundVoucherReferences).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countSponsorAwardReferences).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countConcessionReferences).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countOptionalItemReferences).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countReceiptReferences).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countBulkAllocationLineReferences).toHaveBeenCalledWith("student-1");
      expect(studentRepository.countWalletReferences).toHaveBeenCalledWith("student-1");
      expect(studentGuardianRepository.deleteByStudentId).toHaveBeenCalledWith("student-1", expect.anything());
      expect(studentRepository.delete).toHaveBeenCalledWith("student-1", expect.anything());
    });

    it("blocked by a ledger entry — real 409, guardian links/student row never touched", async () => {
      ledgerEntryRepository.countByStudentId.mockResolvedValue(3);

      await expect(service.delete("student-1", "actor-1")).rejects.toBeInstanceOf(ConflictException);
      await expect(service.delete("student-1", "actor-1")).rejects.toThrow(
        "Cannot delete student: 3 ledger entry(s) still reference it",
      );
      expect(studentGuardianRepository.deleteByStudentId).not.toHaveBeenCalled();
      expect(studentRepository.delete).not.toHaveBeenCalled();
    });

    it("blocked by a real cross-module reference — an invoice (bill_invoice, domains/billing)", async () => {
      studentRepository.countInvoiceReferences.mockResolvedValue(1);

      await expect(service.delete("student-1", "actor-1")).rejects.toThrow(
        "Cannot delete student: 1 invoice(s) still reference it",
      );
      expect(studentRepository.delete).not.toHaveBeenCalled();
    });

    it("blocked by a real cross-module reference — a receipt (pay_receipt, domains/payments)", async () => {
      studentRepository.countReceiptReferences.mockResolvedValue(2);

      await expect(service.delete("student-1", "actor-1")).rejects.toThrow(
        "Cannot delete student: 2 receipt(s) still reference it",
      );
      expect(studentRepository.delete).not.toHaveBeenCalled();
    });

    it("blocked by a real cross-module reference — a wallet (wall_wallet, domains/wallet)", async () => {
      studentRepository.countWalletReferences.mockResolvedValue(1);

      await expect(service.delete("student-1", "actor-1")).rejects.toThrow(
        "Cannot delete student: 1 wallet(s) still reference it",
      );
      expect(studentRepository.delete).not.toHaveBeenCalled();
    });

    it("names every non-zero reference together in one message when multiple relations block deletion", async () => {
      ledgerEntryRepository.countByStudentId.mockResolvedValue(3);
      studentRepository.countInvoiceReferences.mockResolvedValue(1);
      studentRepository.countWalletReferences.mockResolvedValue(1);

      await expect(service.delete("student-1", "actor-1")).rejects.toThrow(
        "Cannot delete student: 3 ledger entry(s) and 1 invoice(s) and 1 wallet(s) still reference it",
      );
    });

    it("404s via findByIdOrFail's own rejection when the student doesn't exist, never reaching any count check", async () => {
      const notFound = new Error("not found");
      studentRepository.findByIdOrFail.mockRejectedValue(notFound);

      await expect(service.delete("missing", "actor-1")).rejects.toBe(notFound);
      expect(ledgerEntryRepository.countByStudentId).not.toHaveBeenCalled();
      expect(studentRepository.delete).not.toHaveBeenCalled();
    });
  });
});
