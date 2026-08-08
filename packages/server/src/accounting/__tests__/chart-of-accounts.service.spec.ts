import { DataSource } from "typeorm";
import { ChartOfAccountsService } from "../application/chart-of-accounts.service";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { GlAccountEntity } from "../domain/gl-account.entity";

function makeAccount(overrides: Partial<GlAccountEntity>): GlAccountEntity {
  return {
    id: "acc-1",
    code: "1010",
    name: "Test Account",
    class: "ASSET",
    parentId: "root-1",
    isPostable: true,
    isControl: false,
    controlDomain: null,
    isActive: true,
    taxTreatment: null,
    ...overrides,
  } as GlAccountEntity;
}

describe("ChartOfAccountsService", () => {
  let accountRepository: {
    findByCode: jest.Mock;
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let dataSource: DataSource;
  let service: ChartOfAccountsService;

  beforeEach(() => {
    accountRepository = {
      findByCode: jest.fn(async () => null),
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeAccount(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
    };
    dataSource = { manager: {} } as unknown as DataSource;
    service = new ChartOfAccountsService(accountRepository as never, dataSource);
  });

  describe("create", () => {
    it("rejects a duplicate code", async () => {
      accountRepository.findByCode.mockResolvedValue(makeAccount({}));
      await expect(
        service.create(
          { code: "1010", name: "Dup", class: "ASSET", parentId: "root-1", isPostable: true },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects a postable account with no parent (mirrors ck_gl_account_postable_needs_parent)", async () => {
      await expect(
        service.create({ code: "9999", name: "Orphan Leaf", class: "ASSET", isPostable: true }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("allows a non-postable root account with no parent", async () => {
      await expect(
        service.create({ code: "9000", name: "Header", class: "ASSET", isPostable: false }, "actor-1"),
      ).resolves.toBeDefined();
    });

    it("validates the parent exists when parentId is given", async () => {
      accountRepository.findByIdOrFail.mockRejectedValue(new Error("not found"));
      await expect(
        service.create(
          { code: "1011", name: "Leaf", class: "ASSET", parentId: "missing-parent", isPostable: true },
          "actor-1",
        ),
      ).rejects.toThrow();
    });
  });

  describe("deactivate vs remove", () => {
    it("deactivate() sets is_active=false (soft, always succeeds)", async () => {
      accountRepository.findByIdOrFail.mockResolvedValue(makeAccount({ isActive: true }));
      const result = await service.deactivate("acc-1", "actor-1");
      expect(result.isActive).toBe(false);
    });

    it("remove() succeeds when the DB delete succeeds (no postings)", async () => {
      accountRepository.findByIdOrFail.mockResolvedValue(makeAccount({}));
      accountRepository.delete.mockResolvedValue(undefined);
      await expect(service.remove("acc-1")).resolves.toBeUndefined();
      expect(accountRepository.delete).toHaveBeenCalledWith("acc-1");
    });

    it("remove() rethrows a BR-ACC-01 trigger rejection as ConflictException", async () => {
      accountRepository.findByIdOrFail.mockResolvedValue(makeAccount({}));
      accountRepository.delete.mockRejectedValue(new Error("BR-ACC-01: account acc-1 has postings and cannot be deleted"));
      await expect(service.remove("acc-1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("remove() rethrows an unrelated DB error unchanged", async () => {
      accountRepository.findByIdOrFail.mockResolvedValue(makeAccount({}));
      const unrelated = new Error("connection reset");
      accountRepository.delete.mockRejectedValue(unrelated);
      await expect(service.remove("acc-1")).rejects.toBe(unrelated);
    });
  });

  describe("update — locked fields", () => {
    it("allows editing name/isControl/controlDomain/taxTreatment", async () => {
      accountRepository.findByIdOrFail.mockResolvedValue(makeAccount({ name: "Old" }));
      const result = await service.update("acc-1", { name: "New Name" }, "actor-1");
      expect(result.name).toBe("New Name");
    });
  });

  describe("getTree", () => {
    it("assembles a parent/child hierarchy", async () => {
      const root = makeAccount({ id: "root-1", code: "1000", parentId: null, isPostable: false });
      const child = makeAccount({ id: "leaf-1", code: "1010", parentId: "root-1", isPostable: true });
      accountRepository.list.mockResolvedValue([root, child]);

      const tree = await service.getTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("root-1");
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe("leaf-1");
    });
  });
});
