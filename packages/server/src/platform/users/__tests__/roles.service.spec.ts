import { DataSource, EntityManager } from "typeorm";
import { RolesService } from "../application/roles.service";
import { SodCheckService } from "../../../shared/rbac/sod-check.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";

describe("RolesService", () => {
  let dataSource: DataSource;
  let roleRepository: { findByName: jest.Mock; findById: jest.Mock; create: jest.Mock; list: jest.Mock; save: jest.Mock };
  let permissionRepository: { findByCode: jest.Mock };
  let rolePermissionRepository: { findForRole: jest.Mock; exists: jest.Mock; grant: jest.Mock; revoke: jest.Mock };
  let userRoleRepository: { exists: jest.Mock; findRolesForUser: jest.Mock; assign: jest.Mock; unassign: jest.Mock };
  let sodRuleRepository: { listEnabledPairs: jest.Mock };
  let userRepository: { findByIdOrFail: jest.Mock };
  let service: RolesService;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;
    roleRepository = {
      findByName: jest.fn(async () => null),
      findById: jest.fn(),
      create: jest.fn(async (data: unknown) => ({ id: "role-1", ...(data as object) })),
      list: jest.fn(),
      save: jest.fn(),
    };
    permissionRepository = { findByCode: jest.fn() };
    rolePermissionRepository = {
      findForRole: jest.fn(async () => []),
      exists: jest.fn(async () => false),
      grant: jest.fn(),
      revoke: jest.fn(),
    };
    userRoleRepository = {
      exists: jest.fn(async () => false),
      findRolesForUser: jest.fn(async () => []),
      assign: jest.fn(),
      unassign: jest.fn(),
    };
    sodRuleRepository = { listEnabledPairs: jest.fn(async () => []) };
    userRepository = { findByIdOrFail: jest.fn(async () => ({ id: "user-1" })) };

    service = new RolesService(
      dataSource,
      roleRepository as never,
      permissionRepository as never,
      rolePermissionRepository as never,
      userRoleRepository as never,
      sodRuleRepository as never,
      userRepository as never,
      new SodCheckService(),
    );
  });

  describe("grantPermission — BR-SEC-04", () => {
    it("rejects granting an is_write permission to an auditor-class role", async () => {
      roleRepository.findById.mockResolvedValue({ id: "role-1", name: "Auditor", isAuditorClass: true });
      permissionRepository.findByCode.mockResolvedValue({ id: "perm-1", code: "billing:invoice:void", isWrite: true });

      await expect(service.grantPermission("role-1", "billing:invoice:void")).rejects.toBeInstanceOf(
        ValidationException,
      );
      expect(rolePermissionRepository.grant).not.toHaveBeenCalled();
    });

    it("allows granting an is_write=false permission to an auditor-class role", async () => {
      roleRepository.findById.mockResolvedValue({ id: "role-1", name: "Auditor", isAuditorClass: true });
      permissionRepository.findByCode.mockResolvedValue({ id: "perm-1", code: "billing:invoice:view", isWrite: false });

      await service.grantPermission("role-1", "billing:invoice:view");
      expect(rolePermissionRepository.grant).toHaveBeenCalledWith("role-1", "perm-1", expect.anything());
    });
  });

  describe("grantPermission — FR-USER-009.1 SoD", () => {
    it("rejects a grant that would complete an enabled SoD pair and names the conflicting pair", async () => {
      roleRepository.findById.mockResolvedValue({ id: "role-1", name: "Bursar", isAuditorClass: false });
      permissionRepository.findByCode.mockResolvedValue({
        id: "perm-approve",
        code: "payments:voucher:approve",
        isWrite: true,
      });
      rolePermissionRepository.findForRole.mockResolvedValue([
        { permission: { code: "payments:voucher:create" } },
      ]);
      sodRuleRepository.listEnabledPairs.mockResolvedValue([
        { permissionACode: "payments:voucher:create", permissionBCode: "payments:voucher:approve" },
      ]);

      await expect(service.grantPermission("role-1", "payments:voucher:approve")).rejects.toMatchObject({
        details: { permissionACode: "payments:voucher:create", permissionBCode: "payments:voucher:approve" },
      });
      expect(rolePermissionRepository.grant).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("rejects a duplicate role name", async () => {
      roleRepository.findByName.mockResolvedValue({ id: "existing" });
      await expect(service.create({ name: "Bursar" })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("assignRoleToUser — FR-USER-009.1", () => {
    it("rejects assigning a role that would complete an enabled SoD pair against the user's existing roles", async () => {
      roleRepository.findById.mockResolvedValue({ id: "role-approve", name: "Approver" });
      userRoleRepository.findRolesForUser.mockResolvedValue([{ roleId: "role-create" }]);
      rolePermissionRepository.findForRole.mockImplementation(async (roleId: string) => {
        if (roleId === "role-create") return [{ permission: { code: "payments:voucher:create" } }];
        if (roleId === "role-approve") return [{ permission: { code: "payments:voucher:approve" } }];
        return [];
      });
      sodRuleRepository.listEnabledPairs.mockResolvedValue([
        { permissionACode: "payments:voucher:create", permissionBCode: "payments:voucher:approve" },
      ]);

      await expect(service.assignRoleToUser("user-1", "role-approve")).rejects.toMatchObject({
        details: { permissionACode: "payments:voucher:create", permissionBCode: "payments:voucher:approve" },
      });
      expect(userRoleRepository.assign).not.toHaveBeenCalled();
    });

    it("assigns the role when no SoD conflict exists", async () => {
      roleRepository.findById.mockResolvedValue({ id: "role-1", name: "Cashier" });
      await service.assignRoleToUser("user-1", "role-1");
      expect(userRoleRepository.assign).toHaveBeenCalledWith("user-1", "role-1", expect.anything());
    });
  });

  describe("listRolesForUser — Phase 6 Slice 13 Part 1", () => {
    it("maps the user's role-grant join rows to their role entities", async () => {
      const roleA = { id: "role-a", name: "Cashier" };
      const roleB = { id: "role-b", name: "Bursar" };
      userRoleRepository.findRolesForUser.mockResolvedValue([{ role: roleA }, { role: roleB }]);

      const result = await service.listRolesForUser("user-1");

      expect(result).toEqual([roleA, roleB]);
      expect(userRoleRepository.findRolesForUser).toHaveBeenCalledWith("user-1");
    });

    it("returns an empty array when the user holds no roles", async () => {
      userRoleRepository.findRolesForUser.mockResolvedValue([]);
      await expect(service.listRolesForUser("user-1")).resolves.toEqual([]);
    });
  });

  describe("listPermissionsForRole — Phase 6 Slice 13 Part 1", () => {
    it("maps the role's permission-grant join rows to their permission entities", async () => {
      const permA = { id: "perm-a", code: "billing:invoice:view", isWrite: false };
      const permB = { id: "perm-b", code: "billing:invoice:void", isWrite: true };
      rolePermissionRepository.findForRole.mockResolvedValue([{ permission: permA }, { permission: permB }]);

      const result = await service.listPermissionsForRole("role-1");

      expect(result).toEqual([permA, permB]);
      expect(rolePermissionRepository.findForRole).toHaveBeenCalledWith("role-1");
    });

    it("returns an empty array when the role has no permissions granted", async () => {
      rolePermissionRepository.findForRole.mockResolvedValue([]);
      await expect(service.listPermissionsForRole("role-1")).resolves.toEqual([]);
    });
  });
});
