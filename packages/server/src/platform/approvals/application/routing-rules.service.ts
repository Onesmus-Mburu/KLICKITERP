import { Injectable } from "@nestjs/common";
import { Money } from "../../../shared/money/money";
import { ApprRoutingRuleEntity } from "../domain/appr-routing-rule.entity";
import { ApprRoutingRuleRepository } from "../infrastructure/appr-routing-rule.repository";

export interface CreateRoutingRuleInput {
  workflowVersionId: string;
  minAmount: Money;
  maxAmount?: Money | null;
  levelSubset?: number[] | null;
  departmentId?: string | null;
}

export interface UpdateRoutingRuleInput {
  minAmount?: Money;
  maxAmount?: Money | null;
  levelSubset?: number[] | null;
  departmentId?: string | null;
}

/**
 * CRUD for `appr_routing_rule`, scoped to a single `workflow_version_id`.
 * Matching semantics (used by `ApprovalEngineService.submit()`/`.decide()`)
 * live in `approval-engine.service.ts`, not here — this service is pure
 * storage CRUD.
 */
@Injectable()
export class RoutingRulesService {
  constructor(private readonly routingRuleRepository: ApprRoutingRuleRepository) {}

  async create(input: CreateRoutingRuleInput, actorId: string | null): Promise<ApprRoutingRuleEntity> {
    return this.routingRuleRepository.create({
      workflowVersionId: input.workflowVersionId,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount ?? null,
      levelSubset: input.levelSubset ?? null,
      departmentId: input.departmentId ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async listByVersion(workflowVersionId: string): Promise<ApprRoutingRuleEntity[]> {
    return this.routingRuleRepository.listByVersion(workflowVersionId);
  }

  async findByIdOrFail(id: string): Promise<ApprRoutingRuleEntity> {
    return this.routingRuleRepository.findByIdOrFail(id);
  }

  async update(id: string, changes: UpdateRoutingRuleInput, actorId: string | null): Promise<ApprRoutingRuleEntity> {
    const rule = await this.routingRuleRepository.findByIdOrFail(id);
    if (changes.minAmount !== undefined) rule.minAmount = changes.minAmount;
    if (changes.maxAmount !== undefined) rule.maxAmount = changes.maxAmount;
    if (changes.levelSubset !== undefined) rule.levelSubset = changes.levelSubset;
    if (changes.departmentId !== undefined) rule.departmentId = changes.departmentId;
    rule.updatedBy = actorId;
    return this.routingRuleRepository.save(rule);
  }
}
