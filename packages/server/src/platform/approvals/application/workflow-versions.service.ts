import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ApprLevelApproverType, ApprLevelMode } from "../domain/appr-level.entity";
import { ApprWorkflowVersionEntity } from "../domain/appr-workflow-version.entity";
import { ApprLevelRepository } from "../infrastructure/appr-level.repository";
import { ApprRoutingRuleRepository } from "../infrastructure/appr-routing-rule.repository";
import { ApprWorkflowDefRepository } from "../infrastructure/appr-workflow-def.repository";
import { ApprWorkflowVersionRepository } from "../infrastructure/appr-workflow-version.repository";
import { Money } from "../../../shared/money/money";

export interface PublishLevelInput {
  seq: number;
  approverType: ApprLevelApproverType;
  roleId?: string | null;
  userIds?: string[] | null;
  mode: ApprLevelMode;
  quorum?: number;
  slaHours?: number | null;
  escalation?: Record<string, unknown> | null;
}

export interface PublishRoutingRuleInput {
  minAmount: Money;
  maxAmount?: Money | null;
  levelSubset?: number[] | null;
  departmentId?: string | null;
}

/**
 * Version CRUD for `appr_workflow_version`, plus the "exactly one
 * `is_current` per `workflow_def_id`" invariant (`uq_appr_workflow_version_current_p`
 * partial unique index) — `setCurrent()` unsets the previous current row
 * inside the same transaction as setting the new one, the identical
 * unset-then-set `tx()` pattern `AcademicCalendarService.setCurrentYear`/
 * `.setCurrentTerm` use.
 *
 * `publishNewVersion()` is the primary authoring path: it creates a brand
 * new version (next sequential `version` number for the def), its levels,
 * and its routing rules all inside one transaction, then marks it current —
 * so a caller never observes a version with levels but no current flag, or
 * vice versa. Per BR-APPR-04, existing `appr_instance` rows keep their own
 * `workflow_version_id` and are unaffected by publishing a new version.
 */
@Injectable()
export class WorkflowVersionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workflowDefRepository: ApprWorkflowDefRepository,
    private readonly workflowVersionRepository: ApprWorkflowVersionRepository,
    private readonly levelRepository: ApprLevelRepository,
    private readonly routingRuleRepository: ApprRoutingRuleRepository,
  ) {}

  async listByDef(workflowDefId: string): Promise<ApprWorkflowVersionEntity[]> {
    return this.workflowVersionRepository.listByDef(workflowDefId);
  }

  async findByIdOrFail(id: string): Promise<ApprWorkflowVersionEntity> {
    return this.workflowVersionRepository.findByIdOrFail(id);
  }

  async findCurrent(workflowDefId: string, manager?: EntityManager): Promise<ApprWorkflowVersionEntity | null> {
    return this.workflowVersionRepository.findCurrent(workflowDefId, manager);
  }

  /**
   * Creates a new `appr_workflow_version` (next `version` number for the
   * def) plus its `levels`/`routingRules` and marks it current, all in one
   * transaction. `levels` must be non-empty and have unique, positive `seq`
   * values — the workflow engine has nothing to route through otherwise.
   */
  async publishNewVersion(
    workflowDefId: string,
    levels: PublishLevelInput[],
    routingRules: PublishRoutingRuleInput[],
    actorId: string | null,
  ): Promise<ApprWorkflowVersionEntity> {
    if (levels.length === 0) {
      throw new ValidationException("publishNewVersion requires at least one level");
    }
    const seqs = levels.map((l) => l.seq);
    if (new Set(seqs).size !== seqs.length) {
      throw new ValidationException("publishNewVersion: level seq values must be unique", { seqs });
    }

    return runInTransaction(this.dataSource, async (manager) => {
      await this.workflowDefRepository.findByIdOrFail(workflowDefId, manager);

      const existing = await this.workflowVersionRepository.listByDef(workflowDefId, manager);
      const nextVersion = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;

      const previousCurrent = existing.find((v) => v.isCurrent) ?? null;
      if (previousCurrent) {
        previousCurrent.isCurrent = false;
        previousCurrent.updatedBy = actorId;
        await this.workflowVersionRepository.save(previousCurrent, manager);
      }

      const created = await this.workflowVersionRepository.create(
        {
          workflowDefId,
          version: nextVersion,
          isCurrent: true,
          createdBy: actorId,
          updatedBy: actorId,
        },
        manager,
      );

      for (const level of levels) {
        await this.levelRepository.create(
          {
            workflowVersionId: created.id,
            seq: level.seq,
            approverType: level.approverType,
            roleId: level.roleId ?? null,
            userIds: level.userIds ?? null,
            mode: level.mode,
            quorum: level.quorum ?? 1,
            slaHours: level.slaHours ?? null,
            escalation: level.escalation ?? null,
            createdBy: actorId,
            updatedBy: actorId,
          },
          manager,
        );
      }

      for (const rule of routingRules) {
        await this.routingRuleRepository.create(
          {
            workflowVersionId: created.id,
            minAmount: rule.minAmount,
            maxAmount: rule.maxAmount ?? null,
            levelSubset: rule.levelSubset ?? null,
            departmentId: rule.departmentId ?? null,
            createdBy: actorId,
            updatedBy: actorId,
          },
          manager,
        );
      }

      return created;
    });
  }

  /** Unsets the previous current version (if any) for the same def, and sets `id` as current — no level/routing-rule changes. */
  async setCurrent(id: string, actorId: string | null): Promise<ApprWorkflowVersionEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const target = await this.workflowVersionRepository.findByIdOrFail(id, manager);
      const previous = await this.workflowVersionRepository.findCurrent(target.workflowDefId, manager);

      if (previous && previous.id !== target.id) {
        previous.isCurrent = false;
        previous.updatedBy = actorId;
        await this.workflowVersionRepository.save(previous, manager);
      }

      target.isCurrent = true;
      target.updatedBy = actorId;
      return this.workflowVersionRepository.save(target, manager);
    });
  }
}
