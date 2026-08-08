import { DepartmentsService } from "../application/departments.service";

describe("DepartmentsService", () => {
  let departmentRepository: { list: jest.Mock; findById: jest.Mock; create: jest.Mock; save: jest.Mock };
  let service: DepartmentsService;

  beforeEach(() => {
    departmentRepository = {
      list: jest.fn(async () => []),
      findById: jest.fn(),
      create: jest.fn(async (data: unknown) => ({ id: "dept-1", ...(data as object) })),
      save: jest.fn(async (entity: unknown) => entity),
    };
    service = new DepartmentsService(departmentRepository as never);
  });

  describe("update — headUserId sync (Phase 6 Slice 13 Part 3 regression)", () => {
    // `UsrDepartmentEntity` has both a scalar `headUserId` column and a
    // `@ManyToOne`/`@JoinColumn headUser` relation on the SAME `head_user_id`
    // column. `findById()` eager-loads `headUser` (Part 1) — a real, live
    // bug (confirmed via `psql` before this fix) meant that once a
    // department's `headUser` relation was loaded, clearing/switching
    // `headUserId` alone left the stale `headUser` object on the entity,
    // which TypeORM's `save()` used to derive the FK, silently discarding
    // the intended scalar change while the caller still received a
    // false-success response. These tests assert `update()` keeps the
    // relation object in sync with the scalar on every `headUserId` change.
    it("clears headUser (not just headUserId) when headUserId is set to null", async () => {
      departmentRepository.findById.mockResolvedValue({
        id: "dept-1",
        name: "Finance",
        headUserId: "user-old",
        headUser: { id: "user-old", fullName: "Old Head" },
      });

      await service.update("dept-1", { headUserId: null });

      const saved = departmentRepository.save.mock.calls[0][0];
      expect(saved.headUserId).toBeNull();
      expect(saved.headUser).toBeNull();
    });

    it("replaces headUser with a reference to the new user when headUserId is switched", async () => {
      departmentRepository.findById.mockResolvedValue({
        id: "dept-1",
        name: "Finance",
        headUserId: "user-old",
        headUser: { id: "user-old", fullName: "Old Head" },
      });

      await service.update("dept-1", { headUserId: "user-new" });

      const saved = departmentRepository.save.mock.calls[0][0];
      expect(saved.headUserId).toBe("user-new");
      expect(saved.headUser).toEqual({ id: "user-new" });
    });

    it("leaves headUser/headUserId untouched when headUserId is not part of the update", async () => {
      departmentRepository.findById.mockResolvedValue({
        id: "dept-1",
        name: "Finance",
        headUserId: "user-old",
        headUser: { id: "user-old", fullName: "Old Head" },
      });

      await service.update("dept-1", { name: "Finance & Accounts" });

      const saved = departmentRepository.save.mock.calls[0][0];
      expect(saved.headUserId).toBe("user-old");
      expect(saved.headUser).toEqual({ id: "user-old", fullName: "Old Head" });
      expect(saved.name).toBe("Finance & Accounts");
    });
  });
});
