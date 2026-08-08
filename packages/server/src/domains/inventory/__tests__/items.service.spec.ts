import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ItemsService } from "../application/items.service";
import { InvItemEntity } from "../domain/inv-item.entity";

function makeItem(overrides: Partial<InvItemEntity> = {}): InvItemEntity {
  return {
    id: "item-1",
    code: "ITM-1",
    name: "Widget",
    categoryId: "cat-1",
    uom: "EA",
    itemType: "STOCK",
    salePrice: null,
    glIncomeAccountId: null,
    avgCost: "0.000000",
    isActive: true,
    ...overrides,
  } as InvItemEntity;
}

describe("ItemsService", () => {
  let itemRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock };
  let categoryRepository: { findByIdOrFail: jest.Mock };
  let service: ItemsService;

  beforeEach(() => {
    itemRepository = {
      create: jest.fn(async (data) => makeItem(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeItem()),
    };
    categoryRepository = { findByIdOrFail: jest.fn(async () => ({ id: "cat-1", name: "Cat" })) };
    service = new ItemsService(itemRepository as never, categoryRepository as never);
  });

  const baseInput = {
    code: "ITM-1",
    name: "Widget",
    categoryId: "cat-1",
    uom: "EA",
    glAssetAccountId: "asset-acc",
    glExpenseAccountId: "expense-acc",
  };

  describe("BR-INV-04 (create)", () => {
    it("rejects a RESALE item with neither sale_price nor gl_income_account_id", async () => {
      await expect(service.create({ ...baseInput, itemType: "RESALE" }, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a RESALE item with sale_price but no gl_income_account_id", async () => {
      await expect(
        service.create({ ...baseInput, itemType: "RESALE", salePrice: Money.fromInt(100) }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a RESALE item with gl_income_account_id but no sale_price", async () => {
      await expect(
        service.create({ ...baseInput, itemType: "RESALE", glIncomeAccountId: "income-acc" }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("accepts a RESALE item with BOTH sale_price and gl_income_account_id", async () => {
      const item = await service.create(
        { ...baseInput, itemType: "RESALE", salePrice: Money.fromInt(100), glIncomeAccountId: "income-acc" },
        "actor-1",
      );
      expect(item.itemType).toBe("RESALE");
    });

    it("does not require sale_price/gl_income_account_id for a non-RESALE item type", async () => {
      await expect(service.create({ ...baseInput, itemType: "STOCK" }, "actor-1")).resolves.toBeDefined();
      await expect(service.create({ ...baseInput, itemType: "CONSUMABLE" }, "actor-1")).resolves.toBeDefined();
      await expect(service.create({ ...baseInput, itemType: "SERVICE" }, "actor-1")).resolves.toBeDefined();
    });
  });

  describe("BR-INV-04 (update)", () => {
    it("rejects flipping an existing item's type INTO RESALE without price/income account", async () => {
      itemRepository.findByIdOrFail.mockResolvedValue(makeItem({ itemType: "STOCK" }));
      await expect(service.update("item-1", { itemType: "RESALE" }, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects clearing sale_price on an already-RESALE item", async () => {
      itemRepository.findByIdOrFail.mockResolvedValue(
        makeItem({ itemType: "RESALE", salePrice: Money.fromInt(50), glIncomeAccountId: "income-acc" }),
      );
      await expect(service.update("item-1", { salePrice: null }, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("accepts flipping into RESALE when both fields are supplied in the same update", async () => {
      itemRepository.findByIdOrFail.mockResolvedValue(makeItem({ itemType: "STOCK" }));
      const updated = await service.update(
        "item-1",
        { itemType: "RESALE", salePrice: Money.fromInt(75), glIncomeAccountId: "income-acc" },
        "actor-1",
      );
      expect(updated.itemType).toBe("RESALE");
    });
  });
});
