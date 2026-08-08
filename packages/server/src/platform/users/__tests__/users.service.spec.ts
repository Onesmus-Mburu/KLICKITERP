import { DataSource, EntityManager } from "typeorm";
import { UsersService } from "../application/users.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";

describe("UsersService — status state machine", () => {
  let dataSource: DataSource;
  let userRepository: { findByIdOrFail: jest.Mock; save: jest.Mock; existsByUsername: jest.Mock; create: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let service: UsersService;

  const makeUser = (status: string) => ({ id: "user-1", status, updatedBy: null });

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;
    userRepository = {
      findByIdOrFail: jest.fn(),
      save: jest.fn(async (u: unknown) => u),
      existsByUsername: jest.fn(async () => false),
      create: jest.fn(),
    };
    outboxWriter = { write: jest.fn() };
    const userRoleRepository = { findUserIdsForRole: jest.fn(async () => []) };
    service = new UsersService(dataSource, userRepository as never, userRoleRepository as never, outboxWriter as never);
  });

  it("allows INVITED -> ACTIVE", async () => {
    userRepository.findByIdOrFail.mockResolvedValue(makeUser("INVITED"));
    const result = await service.changeStatus("user-1", "ACTIVE", "admin-1");
    expect(result.status).toBe("ACTIVE");
    expect(outboxWriter.write).toHaveBeenCalled();
  });

  it("allows ACTIVE -> SUSPENDED -> ACTIVE", async () => {
    userRepository.findByIdOrFail.mockResolvedValue(makeUser("ACTIVE"));
    await service.changeStatus("user-1", "SUSPENDED", "admin-1");

    userRepository.findByIdOrFail.mockResolvedValue(makeUser("SUSPENDED"));
    const result = await service.changeStatus("user-1", "ACTIVE", "admin-1");
    expect(result.status).toBe("ACTIVE");
  });

  it("rejects DEACTIVATED -> ACTIVE as an illegal transition (terminal state)", async () => {
    userRepository.findByIdOrFail.mockResolvedValue(makeUser("DEACTIVATED"));
    await expect(service.changeStatus("user-1", "ACTIVE", "admin-1")).rejects.toBeInstanceOf(ValidationException);
  });

  it("rejects INVITED -> SUSPENDED as an illegal transition", async () => {
    userRepository.findByIdOrFail.mockResolvedValue(makeUser("INVITED"));
    await expect(service.changeStatus("user-1", "SUSPENDED", "admin-1")).rejects.toBeInstanceOf(ValidationException);
  });
});

describe("UsersService.assignDepartment — departmentId/department sync (Phase 6 Slice 13 Part 4 regression)", () => {
  let dataSource: DataSource;
  let userRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;
    userRepository = {
      findByIdOrFail: jest.fn(),
      save: jest.fn(async (u: unknown) => u),
    };
    const userRoleRepository = { findUserIdsForRole: jest.fn(async () => []) };
    const outboxWriter = { write: jest.fn() };
    service = new UsersService(dataSource, userRepository as never, userRoleRepository as never, outboxWriter as never);
  });

  // `UsrUserEntity` has both a scalar `departmentId` column and a
  // `@ManyToOne`/`@JoinColumn department` relation on the SAME
  // `department_id` column. `findByIdOrFail()` eager-loads `department`
  // (Phase 6 Slice 13 Part 1) — a real, live bug (confirmed via `psql`
  // before this fix, the identical class Part 3 already found and fixed for
  // `DepartmentsService.update()`/`headUserId`) meant that once a user's
  // `department` relation was loaded, switching/clearing `departmentId`
  // alone left the stale `department` object on the entity, which TypeORM's
  // `save()` used to derive the FK, silently discarding the intended scalar
  // change on every change after the first.
  it("clears department (not just departmentId) when departmentId is set to null", async () => {
    userRepository.findByIdOrFail.mockResolvedValue({
      id: "user-1",
      departmentId: "dept-old",
      department: { id: "dept-old", name: "Old Dept" },
    });

    await service.assignDepartment("user-1", null, "admin-1");

    const saved = userRepository.save.mock.calls[0][0];
    expect(saved.departmentId).toBeNull();
    expect(saved.department).toBeNull();
  });

  it("replaces department with a reference to the new department when departmentId is switched", async () => {
    userRepository.findByIdOrFail.mockResolvedValue({
      id: "user-1",
      departmentId: "dept-old",
      department: { id: "dept-old", name: "Old Dept" },
    });

    await service.assignDepartment("user-1", "dept-new", "admin-1");

    const saved = userRepository.save.mock.calls[0][0];
    expect(saved.departmentId).toBe("dept-new");
    expect(saved.department).toEqual({ id: "dept-new" });
  });

  it("sets department correctly on the very first assignment (previously null)", async () => {
    userRepository.findByIdOrFail.mockResolvedValue({ id: "user-1", departmentId: null, department: null });

    await service.assignDepartment("user-1", "dept-new", "admin-1");

    const saved = userRepository.save.mock.calls[0][0];
    expect(saved.departmentId).toBe("dept-new");
    expect(saved.department).toEqual({ id: "dept-new" });
  });
});
