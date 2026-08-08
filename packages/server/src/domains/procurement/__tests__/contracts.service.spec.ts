import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ContractsService } from "../application/contracts.service";
import { ProcContractEntity } from "../domain/proc-contract.entity";
import { ProcSupplierEntity } from "../domain/proc-supplier.entity";

function makeContract(overrides: Partial<ProcContractEntity>): ProcContractEntity {
  return {
    id: "contract-1",
    supplierId: "supplier-1",
    title: "Stationery Supply Agreement",
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
    value: Money.fromInt(100000),
    renewalAlertDays: 30,
    documentFileId: null,
    status: "ACTIVE",
    ...overrides,
  } as ProcContractEntity;
}

function makeSupplier(overrides: Partial<ProcSupplierEntity> = {}): ProcSupplierEntity {
  return { id: "supplier-1", name: "Acme", status: "ACTIVE", ...overrides } as ProcSupplierEntity;
}

describe("ContractsService", () => {
  let contractRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; list: jest.Mock; findExpiringSoon: jest.Mock };
  let supplierRepository: { findByIdOrFail: jest.Mock };
  let service: ContractsService;

  beforeEach(() => {
    contractRepository = {
      findByIdOrFail: jest.fn(async () => makeContract({})),
      create: jest.fn(async (data) => makeContract(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
      findExpiringSoon: jest.fn(async () => []),
    };
    supplierRepository = { findByIdOrFail: jest.fn(async () => makeSupplier()) };
    service = new ContractsService(contractRepository as never, supplierRepository as never);
  });

  describe("create", () => {
    it("rejects ends_on before starts_on (ck_proc_contract_dates)", async () => {
      await expect(
        service.create({ supplierId: "supplier-1", title: "Bad Dates", startsOn: "2026-06-01", endsOn: "2026-01-01" }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("creates ACTIVE with default renewal_alert_days=30", async () => {
      const created = await service.create({ supplierId: "supplier-1", title: "Deal", startsOn: "2026-01-01", endsOn: "2026-12-31" }, "actor-1");
      expect(created.status).toBe("ACTIVE");
      expect(contractRepository.create).toHaveBeenCalledWith(expect.objectContaining({ renewalAlertDays: 30 }));
    });
  });

  describe("terminate / markExpired", () => {
    it("terminate() requires ACTIVE", async () => {
      contractRepository.findByIdOrFail.mockResolvedValue(makeContract({ status: "TERMINATED" }));
      await expect(service.terminate("contract-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("terminate() ACTIVE -> TERMINATED", async () => {
      const result = await service.terminate("contract-1", "actor-1");
      expect(result.status).toBe("TERMINATED");
    });

    it("markExpired() ACTIVE -> EXPIRED", async () => {
      const result = await service.markExpired("contract-1", "actor-1");
      expect(result.status).toBe("EXPIRED");
    });
  });

  describe("listExpiringSoon", () => {
    it("with an explicit withinDays, delegates to the repository's uniform-threshold query", async () => {
      await service.listExpiringSoon(14);
      expect(contractRepository.findExpiringSoon).toHaveBeenCalledWith(14);
    });

    it("with no withinDays, filters ACTIVE contracts by their OWN renewal_alert_days", async () => {
      const soon = new Date();
      soon.setUTCDate(soon.getUTCDate() + 5);
      const far = new Date();
      far.setUTCDate(far.getUTCDate() + 400);
      contractRepository.list.mockResolvedValue([
        makeContract({ id: "soon", endsOn: soon.toISOString().slice(0, 10), renewalAlertDays: 30 }),
        makeContract({ id: "far", endsOn: far.toISOString().slice(0, 10), renewalAlertDays: 30 }),
      ]);
      const result = await service.listExpiringSoon();
      expect(result.map((c) => c.id)).toEqual(["soon"]);
    });
  });
});
