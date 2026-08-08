import { ConcessionSchemesService } from "../application/concession-schemes.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { BillConcessionSchemeEntity } from "../domain/bill-concession-scheme.entity";

function makeScheme(overrides: Partial<BillConcessionSchemeEntity>): BillConcessionSchemeEntity {
  return {
    id: "scheme-1",
    name: "Sibling Discount",
    kind: "DISCOUNT",
    calc: "PERCENT",
    value: Money.fromInt(10),
    categoryScope: null,
    allowsStacking: false,
    glAccountId: "acc-concession-1",
    isActive: true,
    ...overrides,
  } as BillConcessionSchemeEntity;
}

describe("ConcessionSchemesService", () => {
  let repo: {
    findByName: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let glAccountRepository: { findByIdOrFail: jest.Mock };
  let service: ConcessionSchemesService;

  beforeEach(() => {
    repo = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeScheme({})),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeScheme(data)),
      save: jest.fn(async (e) => e),
    };
    glAccountRepository = { findByIdOrFail: jest.fn(async (id: string) => ({ id })) };
    service = new ConcessionSchemesService(repo as never, glAccountRepository as never);
  });

  it("rejects a duplicate name", async () => {
    repo.findByName.mockResolvedValue(makeScheme({}));
    await expect(
      service.create(
        { name: "Sibling Discount", kind: "DISCOUNT", calc: "PERCENT", value: Money.fromInt(10), glAccountId: "acc-1" },
        "actor-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("validates gl_account_id exists on create and update", async () => {
    await service.create(
      { name: "Staff Waiver", kind: "WAIVER", calc: "FIXED", value: Money.fromInt(500), glAccountId: "acc-9" },
      "actor-1",
    );
    expect(glAccountRepository.findByIdOrFail).toHaveBeenCalledWith("acc-9");

    await service.update("scheme-1", { glAccountId: "acc-10" }, "actor-1");
    expect(glAccountRepository.findByIdOrFail).toHaveBeenCalledWith("acc-10");
  });

  it("deactivate/activate toggle is_active", async () => {
    expect((await service.deactivate("scheme-1", "actor-1")).isActive).toBe(false);
    expect((await service.activate("scheme-1", "actor-1")).isActive).toBe(true);
  });
});
