import { SponsorsService } from "../application/sponsors.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { BillSponsorEntity } from "../domain/bill-sponsor.entity";

function makeSponsor(overrides: Partial<BillSponsorEntity>): BillSponsorEntity {
  return {
    id: "sponsor-1",
    name: "CDF",
    contacts: {},
    agreementFileId: null,
    allowsCashConversion: false,
    ...overrides,
  } as BillSponsorEntity;
}

describe("SponsorsService", () => {
  let repo: {
    findByName: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: SponsorsService;

  beforeEach(() => {
    repo = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeSponsor({})),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeSponsor(data)),
      save: jest.fn(async (e) => e),
    };
    service = new SponsorsService(repo as never);
  });

  it("rejects a duplicate name", async () => {
    repo.findByName.mockResolvedValue(makeSponsor({}));
    await expect(service.create({ name: "CDF" }, "actor-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("defaults contacts={} and allows_cash_conversion=false", async () => {
    const sponsor = await service.create({ name: "NGO Trust" }, "actor-1");
    expect(sponsor.contacts).toEqual({});
    expect(sponsor.allowsCashConversion).toBe(false);
  });

  it("update() only changes provided fields", async () => {
    const updated = await service.update("sponsor-1", { allowsCashConversion: true }, "actor-1");
    expect(updated.allowsCashConversion).toBe(true);
    expect(updated.name).toBe("CDF");
  });
});
