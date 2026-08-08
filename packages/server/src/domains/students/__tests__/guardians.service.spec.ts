import { DataSource } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GuardiansService } from "../application/guardians.service";
import { StdStudentGuardianEntity } from "../domain/std-student-guardian.entity";

function makeLink(overrides: Partial<StdStudentGuardianEntity> = {}): StdStudentGuardianEntity {
  return {
    id: "link-1",
    studentId: "student-1",
    guardianId: "guardian-1",
    relationship: "MOTHER",
    isPrimary: false,
    receivesBilling: true,
    ...overrides,
  } as StdStudentGuardianEntity;
}

describe("GuardiansService.linkToStudent — exactly-one-primary enforcement", () => {
  let guardianRepository: { findByIdOrFail: jest.Mock; findByPhone: jest.Mock; create: jest.Mock };
  let studentGuardianRepository: {
    findByStudentAndGuardian: jest.Mock;
    findPrimaryForStudent: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  let studentRepository: { findByIdOrFail: jest.Mock };
  let dataSource: DataSource;
  let service: GuardiansService;

  beforeEach(() => {
    guardianRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "guardian-1" })),
      findByPhone: jest.fn(async () => null),
      create: jest.fn(async (d) => d),
    };
    studentGuardianRepository = {
      findByStudentAndGuardian: jest.fn(async () => null),
      findPrimaryForStudent: jest.fn(async () => null),
      save: jest.fn(async (e) => e),
      create: jest.fn(async (d) => ({ ...d, id: "link-new" })),
      delete: jest.fn(async () => undefined),
    };
    studentRepository = { findByIdOrFail: jest.fn(async () => ({ id: "student-1" })) };

    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (m: unknown) => Promise<unknown>) => work({})),
    } as unknown as DataSource;

    service = new GuardiansService(
      dataSource,
      guardianRepository as never,
      studentGuardianRepository as never,
      studentRepository as never,
    );
  });

  it("creates a new non-primary link without touching any existing primary", async () => {
    await service.linkToStudent("student-1", "guardian-1", "FATHER", false, true, "actor-1");
    expect(studentGuardianRepository.findPrimaryForStudent).not.toHaveBeenCalled();
    expect(studentGuardianRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: false }),
      expect.anything(),
    );
  });

  it("unsets the previous primary link before setting a new one as primary", async () => {
    const previousPrimary = makeLink({ id: "link-old", guardianId: "guardian-old", isPrimary: true });
    studentGuardianRepository.findPrimaryForStudent.mockResolvedValue(previousPrimary);

    await service.linkToStudent("student-1", "guardian-1", "MOTHER", true, true, "actor-1");

    expect(studentGuardianRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "link-old", isPrimary: false }),
      expect.anything(),
    );
    expect(studentGuardianRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: true }),
      expect.anything(),
    );
  });

  it("does not unset-then-recreate when re-linking the same pair that is already primary", async () => {
    const existingLink = makeLink({ isPrimary: true });
    studentGuardianRepository.findByStudentAndGuardian.mockResolvedValue(existingLink);
    studentGuardianRepository.findPrimaryForStudent.mockResolvedValue(existingLink);

    await service.linkToStudent("student-1", "guardian-1", "MOTHER", true, true, "actor-1");

    // The existing link is the same row as the "previous primary" — must not be redundantly unset.
    expect(studentGuardianRepository.save).toHaveBeenCalledTimes(1);
    expect(studentGuardianRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: existingLink.id, isPrimary: true }),
      expect.anything(),
    );
  });

  it("updates link attributes in place when the pair already has a link row", async () => {
    const existingLink = makeLink({ relationship: "MOTHER", isPrimary: false });
    studentGuardianRepository.findByStudentAndGuardian.mockResolvedValue(existingLink);

    const result = await service.linkToStudent("student-1", "guardian-1", "GUARDIAN", false, false, "actor-1");

    expect(result.relationship).toBe("GUARDIAN");
    expect(result.receivesBilling).toBe(false);
    expect(studentGuardianRepository.create).not.toHaveBeenCalled();
  });

  it("unlinkFromStudent deletes the link row when found", async () => {
    const existingLink = makeLink();
    studentGuardianRepository.findByStudentAndGuardian.mockResolvedValue(existingLink);
    await service.unlinkFromStudent("student-1", "guardian-1");
    expect(studentGuardianRepository.delete).toHaveBeenCalledWith(existingLink.id);
  });

  it("unlinkFromStudent is a no-op when no link exists", async () => {
    await service.unlinkFromStudent("student-1", "guardian-1");
    expect(studentGuardianRepository.delete).not.toHaveBeenCalled();
  });
});

describe("GuardiansService.create — phone-or-email (Phase 6 Slice 2b item 4)", () => {
  let guardianRepository: { findByPhone: jest.Mock; findByEmail: jest.Mock; create: jest.Mock };
  let service: GuardiansService;

  beforeEach(() => {
    guardianRepository = {
      findByPhone: jest.fn(async () => null),
      findByEmail: jest.fn(async () => null),
      create: jest.fn(async (d) => ({ ...d, id: "guardian-new" })),
    };
    service = new GuardiansService(
      {} as DataSource,
      guardianRepository as never,
      {} as never,
      {} as never,
    );
  });

  it("rejects when neither phone nor email is supplied — mirrors ck_std_guardian_contact/UsersService.create()'s pattern", async () => {
    await expect(
      service.create({ fullName: "No Contact" }, "actor-1"),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(guardianRepository.create).not.toHaveBeenCalled();
  });

  it("succeeds with only an email (no phone) — the whole point of item 4", async () => {
    const { guardian, wasExisting } = await service.create({ fullName: "Email Only", email: "guardian@example.com" }, "actor-1");
    expect(guardian.phone).toBeNull();
    expect(wasExisting).toBe(false);
    expect(guardianRepository.findByPhone).not.toHaveBeenCalled();
    expect(guardianRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, email: "guardian@example.com" }),
    );
  });

  it("succeeds with only a phone (no email) — unchanged prior behavior", async () => {
    const { guardian, wasExisting } = await service.create({ fullName: "Phone Only", phone: "+254700000000" }, "actor-1");
    expect(guardian.email).toBeNull();
    expect(wasExisting).toBe(false);
    expect(guardianRepository.findByPhone).toHaveBeenCalledWith("+254700000000");
  });
});

describe("GuardiansService.create — sibling guardian dedup, phone-first precedence (Phase 6 Slice 2c)", () => {
  let guardianRepository: { findByPhone: jest.Mock; findByEmail: jest.Mock; create: jest.Mock };
  let service: GuardiansService;

  beforeEach(() => {
    guardianRepository = {
      findByPhone: jest.fn(async () => null),
      findByEmail: jest.fn(async () => null),
      create: jest.fn(async (d) => ({ ...d, id: "guardian-new" })),
    };
    service = new GuardiansService(
      {} as DataSource,
      guardianRepository as never,
      {} as never,
      {} as never,
    );
  });

  it("a genuinely new phone creates a fresh guardian (wasExisting: false)", async () => {
    const { guardian, wasExisting } = await service.create({ fullName: "New Parent", phone: "+254700000010" }, "actor-1");
    expect(wasExisting).toBe(false);
    expect(guardian.id).toBe("guardian-new");
    expect(guardianRepository.create).toHaveBeenCalledTimes(1);
  });

  it("a duplicate phone reuses the existing guardian with no error (wasExisting: true, same id)", async () => {
    guardianRepository.findByPhone.mockResolvedValue({ id: "guardian-existing-1", fullName: "Existing Parent", phone: "+254700000011", email: null });
    const { guardian, wasExisting } = await service.create({ fullName: "Second Child's Father", phone: "+254700000011" }, "actor-1");
    expect(wasExisting).toBe(true);
    expect(guardian.id).toBe("guardian-existing-1");
    expect(guardianRepository.create).not.toHaveBeenCalled();
    expect(guardianRepository.findByEmail).not.toHaveBeenCalled();
  });

  it("a duplicate email (no phone match) reuses the existing guardian with no error (wasExisting: true, same id)", async () => {
    guardianRepository.findByEmail.mockResolvedValue({ id: "guardian-existing-2", fullName: "Existing Mother", phone: null, email: "mother@example.com" });
    const { guardian, wasExisting } = await service.create({ fullName: "Second Child's Mother", email: "mother@example.com" }, "actor-1");
    expect(wasExisting).toBe(true);
    expect(guardian.id).toBe("guardian-existing-2");
    expect(guardianRepository.create).not.toHaveBeenCalled();
  });

  it("a duplicate phone+email together still only reuses ONE guardian (phone match wins, email never checked)", async () => {
    guardianRepository.findByPhone.mockResolvedValue({ id: "guardian-existing-3", fullName: "Existing Parent", phone: "+254700000012", email: "other@example.com" });
    const { guardian, wasExisting } = await service.create(
      { fullName: "Second Child's Father", phone: "+254700000012", email: "another@example.com" },
      "actor-1",
    );
    expect(wasExisting).toBe(true);
    expect(guardian.id).toBe("guardian-existing-3");
    expect(guardianRepository.findByEmail).not.toHaveBeenCalled();
  });

  it("phone matches guardian A while email independently matches guardian B — phone wins (documented precedence)", async () => {
    guardianRepository.findByPhone.mockResolvedValue({ id: "guardian-A-phone-match", fullName: "Guardian A", phone: "+254700000013", email: null });
    guardianRepository.findByEmail.mockResolvedValue({ id: "guardian-B-email-match", fullName: "Guardian B", phone: null, email: "shared@example.com" });
    const { guardian, wasExisting } = await service.create(
      { fullName: "Ambiguous Contact", phone: "+254700000013", email: "shared@example.com" },
      "actor-1",
    );
    expect(wasExisting).toBe(true);
    expect(guardian.id).toBe("guardian-A-phone-match");
    // Phone's real DB-backed uniqueness guarantee makes it checked first —
    // once it matches, email is never even looked up.
    expect(guardianRepository.findByEmail).not.toHaveBeenCalled();
  });
});
