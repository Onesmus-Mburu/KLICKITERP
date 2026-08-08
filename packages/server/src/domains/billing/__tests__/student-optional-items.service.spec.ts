import { StudentOptionalItemsService } from "../application/student-optional-items.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { BillStudentOptionalItemEntity } from "../domain/bill-student-optional-item.entity";

function makeItem(overrides: Partial<BillStudentOptionalItemEntity>): BillStudentOptionalItemEntity {
  return {
    id: "item-1",
    studentId: "student-1",
    termId: "term-1",
    feeCategoryId: "cat-1",
    amountOverride: null,
    ...overrides,
  } as BillStudentOptionalItemEntity;
}

describe("StudentOptionalItemsService", () => {
  let repo: {
    listByStudentAndTerm: jest.Mock;
    findByIdOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let service: StudentOptionalItemsService;

  beforeEach(() => {
    repo = {
      listByStudentAndTerm: jest.fn(async () => []),
      findByIdOrFail: jest.fn(async () => makeItem({})),
      create: jest.fn(async (data) => makeItem(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
    };
    service = new StudentOptionalItemsService(repo as never);
  });

  it("rejects a duplicate (student, term, category) opt-in", async () => {
    repo.listByStudentAndTerm.mockResolvedValue([makeItem({ feeCategoryId: "cat-1" })]);
    await expect(
      service.create({ studentId: "student-1", termId: "term-1", feeCategoryId: "cat-1" }, "actor-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates an opt-in with a null amount_override by default", async () => {
    const item = await service.create({ studentId: "student-1", termId: "term-1", feeCategoryId: "cat-2" }, "actor-1");
    expect(item.amountOverride).toBeNull();
  });

  it("creates an opt-in with an explicit amount_override", async () => {
    const item = await service.create(
      { studentId: "student-1", termId: "term-1", feeCategoryId: "cat-2", amountOverride: Money.fromInt(300) },
      "actor-1",
    );
    expect(item.amountOverride?.equals(Money.fromInt(300))).toBe(true);
  });

  it("update() sets amount_override", async () => {
    const updated = await service.update("item-1", { amountOverride: Money.fromInt(50) }, "actor-1");
    expect(updated.amountOverride?.equals(Money.fromInt(50))).toBe(true);
  });

  it("remove() deletes after existence check", async () => {
    await service.remove("item-1");
    expect(repo.findByIdOrFail).toHaveBeenCalledWith("item-1");
    expect(repo.delete).toHaveBeenCalledWith("item-1");
  });
});
