import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ProcContractEntity, ProcContractStatus } from "../domain/proc-contract.entity";
import { ListProcContractsFilter, ProcContractRepository } from "../infrastructure/proc-contract.repository";
import { ProcSupplierRepository } from "../infrastructure/proc-supplier.repository";

export interface CreateContractInput {
  supplierId: string;
  title: string;
  startsOn: string;
  endsOn: string;
  value?: Money | null;
  renewalAlertDays?: number;
  documentFileId?: string | null;
}

export interface UpdateContractInput {
  title?: string;
  startsOn?: string;
  endsOn?: string;
  value?: Money | null;
  renewalAlertDays?: number;
  documentFileId?: string | null;
}

const DEFAULT_RENEWAL_ALERT_DAYS = 30;

/**
 * CRUD for `proc_contract`, plus `listExpiringSoon()`.
 *
 * **`listExpiringSoon(withinDays?)`** — "contracts where `ends_on` falls
 * within `renewal_alert_days` (or a caller-supplied override) of today". When
 * `withinDays` IS given, every `ACTIVE` contract is checked against that ONE
 * uniform threshold (`ProcContractRepository.findExpiringSoon()`, a single
 * SQL `WHERE` clause). When it is NOT given, each contract's OWN
 * `renewal_alert_days` applies — a genuinely per-row threshold that a single
 * parameterized SQL comparison can't express against `ProcContractRepository`'s
 * plain-wrapper shape (no per-row-column-vs-computed-date SQL predicate is
 * built there), so this method fetches every `ACTIVE` contract and filters
 * in application code instead — acceptable given contract counts are small
 * (this is a periodic renewal-alert query, not a hot path).
 *
 * **No notification dispatch** — this method only exposes the query; actual
 * "alert someone" delivery needs a scheduler (a periodic job invoking this
 * method and calling `platform/comms`) that does not exist anywhere in this
 * codebase yet (the same "event exists, dispatcher doesn't" gap every other
 * domain module's `onApprovalDecided()` already documents for approvals).
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly contractRepository: ProcContractRepository,
    private readonly supplierRepository: ProcSupplierRepository,
  ) {}

  async create(input: CreateContractInput, actorId: string | null): Promise<ProcContractEntity> {
    await this.supplierRepository.findByIdOrFail(input.supplierId);
    if (input.endsOn < input.startsOn) {
      throw new ValidationException("ck_proc_contract_dates: ends_on must be >= starts_on");
    }
    return this.contractRepository.create({
      supplierId: input.supplierId,
      title: input.title,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      value: input.value ?? null,
      renewalAlertDays: input.renewalAlertDays ?? DEFAULT_RENEWAL_ALERT_DAYS,
      documentFileId: input.documentFileId ?? null,
      status: "ACTIVE",
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<ProcContractEntity> {
    return this.contractRepository.findByIdOrFail(id);
  }

  async list(filter: ListProcContractsFilter = {}): Promise<ProcContractEntity[]> {
    return this.contractRepository.list(filter);
  }

  async update(id: string, changes: UpdateContractInput, actorId: string | null): Promise<ProcContractEntity> {
    const contract = await this.contractRepository.findByIdOrFail(id);
    if (changes.title !== undefined) contract.title = changes.title;
    if (changes.startsOn !== undefined) contract.startsOn = changes.startsOn;
    if (changes.endsOn !== undefined) contract.endsOn = changes.endsOn;
    if (contract.endsOn < contract.startsOn) {
      throw new ValidationException("ck_proc_contract_dates: ends_on must be >= starts_on");
    }
    if (changes.value !== undefined) contract.value = changes.value;
    if (changes.renewalAlertDays !== undefined) contract.renewalAlertDays = changes.renewalAlertDays;
    if (changes.documentFileId !== undefined) contract.documentFileId = changes.documentFileId;
    contract.updatedBy = actorId;
    return this.contractRepository.save(contract);
  }

  async terminate(id: string, actorId: string | null = null): Promise<ProcContractEntity> {
    return this.transitionStatus(id, "ACTIVE", "TERMINATED", actorId);
  }

  async markExpired(id: string, actorId: string | null = null): Promise<ProcContractEntity> {
    return this.transitionStatus(id, "ACTIVE", "EXPIRED", actorId);
  }

  /** See class doc comment "listExpiringSoon()". */
  async listExpiringSoon(withinDays?: number): Promise<ProcContractEntity[]> {
    if (withinDays !== undefined) {
      return this.contractRepository.findExpiringSoon(withinDays);
    }
    const active = await this.contractRepository.list({ status: "ACTIVE" });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return active.filter((contract) => {
      const threshold = new Date(today);
      threshold.setUTCDate(threshold.getUTCDate() + contract.renewalAlertDays);
      return new Date(`${contract.endsOn}T00:00:00.000Z`) <= threshold;
    });
  }

  private async transitionStatus(
    id: string,
    from: ProcContractStatus,
    to: ProcContractStatus,
    actorId: string | null,
  ): Promise<ProcContractEntity> {
    const contract = await this.contractRepository.findByIdOrFail(id);
    if (contract.status !== from) {
      throw new ValidationException(`proc_contract ${id} must be ${from} to transition to ${to} (status=${contract.status})`);
    }
    contract.status = to;
    contract.updatedBy = actorId;
    return this.contractRepository.save(contract);
  }
}
