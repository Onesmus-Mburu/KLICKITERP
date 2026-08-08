import { PermissionsService } from "../application/permissions.service";

describe("PermissionsService — Phase 6 Slice 13 Part 1", () => {
  let permissionRepository: { list: jest.Mock; findByModule: jest.Mock };
  let service: PermissionsService;

  beforeEach(() => {
    permissionRepository = {
      list: jest.fn(async () => []),
      findByModule: jest.fn(async () => []),
    };
    service = new PermissionsService(permissionRepository as never);
  });

  describe("list()", () => {
    it("returns the full catalogue when no module filter is given", async () => {
      const all = [
        { id: "p1", code: "users:user:view", module: "users", isWrite: false },
        { id: "p2", code: "billing:invoice:view", module: "billing", isWrite: false },
      ];
      permissionRepository.list.mockResolvedValue(all);

      const result = await service.list();

      expect(result).toEqual(all);
      expect(permissionRepository.list).toHaveBeenCalledTimes(1);
      expect(permissionRepository.findByModule).not.toHaveBeenCalled();
    });

    it("returns the full catalogue when module is an empty string (falsy, not a real filter)", async () => {
      const all = [{ id: "p1", code: "users:user:view", module: "users", isWrite: false }];
      permissionRepository.list.mockResolvedValue(all);

      const result = await service.list("");

      expect(result).toEqual(all);
      expect(permissionRepository.findByModule).not.toHaveBeenCalled();
    });
  });

  describe("list(module)", () => {
    it("filters to only the given module's codes via findByModule", async () => {
      const usersOnly = [
        { id: "p1", code: "users:user:view", module: "users", isWrite: false },
        { id: "p2", code: "users:role:view", module: "users", isWrite: false },
      ];
      permissionRepository.findByModule.mockResolvedValue(usersOnly);

      const result = await service.list("users");

      expect(result).toEqual(usersOnly);
      expect(permissionRepository.findByModule).toHaveBeenCalledWith("users");
      expect(permissionRepository.list).not.toHaveBeenCalled();
    });

    it("returns an empty array for a module with no permission codes", async () => {
      permissionRepository.findByModule.mockResolvedValue([]);
      await expect(service.list("nonexistent-module")).resolves.toEqual([]);
    });
  });
});
