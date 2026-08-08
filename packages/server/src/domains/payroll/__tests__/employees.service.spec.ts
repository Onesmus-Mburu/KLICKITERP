import { AppConfigService } from "../../../shared/config/app-config.service";
import { EmployeesService } from "../application/employees.service";
import { PyrlEmployeeEntity } from "../domain/pyrl-employee.entity";

function makeEmployee(overrides: Partial<PyrlEmployeeEntity>): PyrlEmployeeEntity {
  return {
    id: "emp-1",
    staffNo: "EMP-001",
    userId: null,
    fullName: "Jane Doe",
    nationalId: "12345678",
    kraPin: "A123456789Z",
    nssfNo: null,
    shifNo: null,
    employmentType: "PERMANENT",
    departmentId: "dept-1",
    jobTitle: "Teacher",
    hireDate: "2024-01-01",
    exitDate: null,
    payDetails: null,
    bankName: null,
    branch: null,
    account: null,
    costCenterId: "cc-1",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlEmployeeEntity;
}

describe("EmployeesService", () => {
  let repo: {
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByStaffNo: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    searchByName: jest.Mock;
  };
  let service: EmployeesService;
  const config = new AppConfigService();

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(async () => makeEmployee({})),
      findByStaffNo: jest.fn(),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeEmployee(data)),
      save: jest.fn(async (e) => e),
      searchByName: jest.fn(async () => []),
    };
    service = new EmployeesService(repo as never, config);
  });

  describe("create", () => {
    it("encrypts pay_details/bank_name/branch/account and returns a redacted view", async () => {
      const created = await service.create(
        {
          staffNo: "EMP-002",
          fullName: "John Smith",
          nationalId: "87654321",
          kraPin: "B987654321Z",
          employmentType: "PERMANENT",
          departmentId: "dept-1",
          jobTitle: "Clerk",
          hireDate: "2026-01-01",
          costCenterId: "cc-1",
          payDetails: { salary: 50000 },
          bankName: "Equity Bank",
          branch: "Nairobi",
          account: "0011223344",
        },
        "actor-1",
      );

      const createCallArg = repo.create.mock.calls[0][0];
      // Stored value must be an opaque base64 string, never the plaintext.
      expect(typeof createCallArg.payDetails).toBe("string");
      expect(createCallArg.payDetails).not.toContain("50000");
      expect(typeof createCallArg.bankName).toBe("string");
      expect(createCallArg.bankName).not.toContain("Equity Bank");

      // get()/create() return a redacted view — never ciphertext, never plaintext.
      expect(created.payDetails).toBe("***");
      expect(created.bankName).toBe("***");
      expect(created.branch).toBe("***");
      expect(created.account).toBe("***");
    });

    it("leaves encrypted fields NULL when omitted", async () => {
      const created = await service.create(
        {
          staffNo: "EMP-003",
          fullName: "No Bank Details",
          nationalId: "11112222",
          kraPin: "C111222333Z",
          employmentType: "CASUAL",
          departmentId: "dept-1",
          jobTitle: "Casual",
          hireDate: "2026-01-01",
          costCenterId: "cc-1",
        },
        "actor-1",
      );
      const createCallArg = repo.create.mock.calls[0][0];
      expect(createCallArg.payDetails).toBeNull();
      expect(created.payDetails).toBeNull();
    });
  });

  describe("getDecrypted", () => {
    it("round-trips encrypted fields back to their original plaintext", async () => {
      await service.create(
        {
          staffNo: "EMP-004",
          fullName: "Round Trip",
          nationalId: "33334444",
          kraPin: "D333444555Z",
          employmentType: "PERMANENT",
          departmentId: "dept-1",
          jobTitle: "Accountant",
          hireDate: "2026-01-01",
          costCenterId: "cc-1",
          payDetails: { salary: 75000, currency: "KES" },
          bankName: "KCB",
          branch: "Westlands",
          account: "9988776655",
        },
        "actor-1",
      );
      // The repository sees the RAW (encrypted) entity `create()` persisted — not
      // `service.create()`'s own REDACTED return value. Feed that raw entity back
      // in so `getDecrypted()` has real ciphertext to decrypt against.
      const persistedData = repo.create.mock.calls[0][0];
      repo.findByIdOrFail.mockResolvedValue(makeEmployee(persistedData));

      const decrypted = await service.getDecrypted("emp-1");
      expect(decrypted.payDetails).toEqual({ salary: 75000, currency: "KES" });
      expect(decrypted.bankName).toBe("KCB");
      expect(decrypted.branch).toBe("Westlands");
      expect(decrypted.account).toBe("9988776655");
    });

    it("returns null for unset encrypted fields", async () => {
      repo.findByIdOrFail.mockResolvedValue(makeEmployee({}));
      const decrypted = await service.getDecrypted("emp-1");
      expect(decrypted.payDetails).toBeNull();
      expect(decrypted.bankName).toBeNull();
    });
  });

  describe("get/list/search redaction", () => {
    it("get() redacts encrypted fields that are set", async () => {
      repo.findByIdOrFail.mockResolvedValue(makeEmployee({ payDetails: "ciphertext-blob" }));
      const row = await service.get("emp-1");
      expect(row.payDetails).toBe("***");
    });

    it("list() redacts every row", async () => {
      repo.list.mockResolvedValue([makeEmployee({ bankName: "blob" }), makeEmployee({ id: "emp-2", bankName: null })]);
      const rows = await service.list();
      expect(rows[0].bankName).toBe("***");
      expect(rows[1].bankName).toBeNull();
    });

    it("search() delegates to the trgm repository method and redacts results", async () => {
      repo.searchByName.mockResolvedValue([makeEmployee({ account: "blob" })]);
      const rows = await service.search("jane", 10);
      expect(repo.searchByName).toHaveBeenCalledWith("jane", 10);
      expect(rows[0].account).toBe("***");
    });
  });

  describe("exit", () => {
    it("sets is_active=false and exit_date", async () => {
      repo.findByIdOrFail.mockResolvedValue(makeEmployee({}));
      const row = await service.exit("emp-1", "2026-07-31");
      expect(row.isActive).toBe(false);
      expect(row.exitDate).toBe("2026-07-31");
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, exitDate: "2026-07-31" }));
    });
  });
});
