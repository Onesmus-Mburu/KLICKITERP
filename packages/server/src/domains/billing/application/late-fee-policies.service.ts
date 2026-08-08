import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { BillLateFeeMode, BillLateFeePolicyEntity } from "../domain/bill-late-fee-policy.entity";
import { BillLateFeePolicyRepository } from "../infrastructure/bill-late-fee-policy.repository";

export interface CreateLateFeePolicyInput {
  name: string;
  mode: BillLateFeeMode;
  params: Record<string, unknown>;
  graceDays?: number;
  requiresApproval?: boolean;
}

export interface UpdateLateFeePolicyInput {
  mode?: BillLateFeeMode;
  params?: Record<string, unknown>;
  graceDays?: number;
  requiresApproval?: boolean;
}

/**
 * CRUD for `bill_late_fee_policy` (BR-BILL-10/BR-BILL-11) — straightforward
 * per the task brief. `params`' mode-specific shape (interpreted by
 * `LateFeeBatchesService.computeCharge()`, not validated structurally here
 * beyond "is an object" since `jsonb` is opaque at this layer):
 *  - `FLAT`: `{ amount: string }` — a flat decimal-string charge per overdue
 *    invoice.
 *  - `PERCENT`: `{ rate: string }` — a decimal-string rate (e.g. `"0.05"` for
 *    5%) applied to each overdue invoice's own `balance`.
 *  - `TIERED`: `{ tiers: [{ minDaysOverdue: number, maxDaysOverdue?: number,
 *    amount?: string, rate?: string }] }` — the first tier whose
 *    `[minDaysOverdue, maxDaysOverdue]` (inclusive both ends, `maxDaysOverdue`
 *    omitted = open-ended) contains the invoice's days-overdue count wins;
 *    `amount` (flat) takes precedence over `rate` (percentage of balance) if
 *    both are set on the same tier; no matching tier means no charge for that
 *    invoice.
 */
@Injectable()
export class LateFeePoliciesService {
  constructor(private readonly policyRepository: BillLateFeePolicyRepository) {}

  async create(input: CreateLateFeePolicyInput, actorId: string | null): Promise<BillLateFeePolicyEntity> {
    if (await this.policyRepository.findByName(input.name)) {
      throw new ConflictException(`bill_late_fee_policy name already in use: ${input.name}`);
    }
    return this.policyRepository.create({
      name: input.name,
      mode: input.mode,
      params: input.params,
      graceDays: input.graceDays ?? 0,
      requiresApproval: input.requiresApproval ?? false,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<BillLateFeePolicyEntity> {
    return this.policyRepository.findByIdOrFail(id);
  }

  async list(): Promise<BillLateFeePolicyEntity[]> {
    return this.policyRepository.list();
  }

  async update(id: string, changes: UpdateLateFeePolicyInput, actorId: string | null): Promise<BillLateFeePolicyEntity> {
    const policy = await this.policyRepository.findByIdOrFail(id);
    if (changes.mode !== undefined) policy.mode = changes.mode;
    if (changes.params !== undefined) policy.params = changes.params;
    if (changes.graceDays !== undefined) policy.graceDays = changes.graceDays;
    if (changes.requiresApproval !== undefined) policy.requiresApproval = changes.requiresApproval;
    policy.updatedBy = actorId;
    return this.policyRepository.save(policy);
  }

  async deactivate(id: string, actorId: string | null): Promise<BillLateFeePolicyEntity> {
    const policy = await this.policyRepository.findByIdOrFail(id);
    policy.isActive = false;
    policy.updatedBy = actorId;
    return this.policyRepository.save(policy);
  }

  async activate(id: string, actorId: string | null): Promise<BillLateFeePolicyEntity> {
    const policy = await this.policyRepository.findByIdOrFail(id);
    policy.isActive = true;
    policy.updatedBy = actorId;
    return this.policyRepository.save(policy);
  }
}
