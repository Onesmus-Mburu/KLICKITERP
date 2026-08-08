import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { AuthorizationException } from "../../../shared/exceptions/authorization.exception";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { DepartmentsService, UsersService } from "../../users";
import { ApprActionDecision, ApprActionEntity } from "../domain/appr-action.entity";
import { ApprInstanceEntity } from "../domain/appr-instance.entity";
import { ApprLevelEntity } from "../domain/appr-level.entity";
import { ApprRoutingRuleEntity } from "../domain/appr-routing-rule.entity";
import { ApprovalDecidedEvent } from "../events/approval-decided.event";
import { ApprActionRepository } from "../infrastructure/appr-action.repository";
import { ApprInstanceRepository, ListInstancesFilter } from "../infrastructure/appr-instance.repository";
import { ApprLevelRepository } from "../infrastructure/appr-level.repository";
import { ApprRoutingRuleRepository } from "../infrastructure/appr-routing-rule.repository";
import { ApprWorkflowDefRepository } from "../infrastructure/appr-workflow-def.repository";
import { ApprWorkflowVersionRepository } from "../infrastructure/appr-workflow-version.repository";
import { DelegationsService } from "./delegations.service";

/** Postgres unique_violation SQLSTATE — see NumberingService.allocate() for the same pattern. */
const PG_UNIQUE_VIOLATION = "23505";

export interface SubmitApprovalInput {
  domainCode: string;
  entityType: string;
  entityId: string;
  amount?: Money | null;
  initiatorId: string;
}

interface RoutingResolution {
  levels: ApprLevelEntity[];
  matchedRule: ApprRoutingRuleEntity | null;
}

interface AuthorizationResult {
  authorized: boolean;
  /** The legitimate approver whose authority is being exercised — either `actorId` itself, or the user `actorId` is the resolved delegate of. */
  legitimateApproverId: string | null;
  /** Set only when `actorId` acted as the resolved delegate of `legitimateApproverId` — recorded on the `appr_action` row. */
  wasDelegatedFrom: string | null;
}

/**
 * THE generic reusable approval-workflow engine (docs/phase-3/01-system-architecture.md
 * §5, FR-APPR-007.1: "Generic `ApprovalInstance` attached by domain code;
 * engine owns transitions; domains verify `approval_ref` before posting").
 * Every future domain module (billing waivers, payment vouchers, procurement
 * POs, payroll runs, journal entries, ...) calls `submit()` inside its own
 * business transaction to attach an approval gate to a document, then
 * `getStatus()` before allowing that document to post/finalize.
 *
 * `domain_code` is an open string namespace (see `WorkflowDefinitionsService`'s
 * doc comment) — codes registered so far in this codebase's seed data: none
 * yet (Module 6 ships no default workflow defs; each consuming module seeds
 * its own `appr_workflow_def` row + at least one `appr_workflow_version` via
 * `WorkflowVersionsService.publishNewVersion()` in its own `09xx` seed
 * migration before calling `submit()` in anger).
 *
 * **Routing/level resolution is re-derived, not persisted**: `appr_instance`
 * has no `level_subset`/`matched_rule_id` column in the DDL, so
 * `resolveApplicableLevels()` re-runs the same deterministic matching
 * algorithm at both `submit()` and `decide()`/`listPendingForApprover()`
 * time, keyed off `instance.amount` (frozen at submission, BR-APPR-02) and
 * the initiator's *current* `department_id`. A routing rule matches when
 * `amount` falls in `[min_amount, max_amount)` (min inclusive, max
 * exclusive — an unset `max_amount` means "no upper bound") AND, if the
 * rule sets `department_id`, the initiating user's `department_id` equals
 * it (department is derived from the initiator rather than accepted as a
 * `submit()` parameter — the DDL gives `appr_routing_rule` its own
 * `department_id` column but `appr_instance`/`submit()`'s input shape has
 * none, so the initiator's own department is the only available department
 * context). The first matching rule (rules ordered by `min_amount` ASC)
 * wins; no match (or `amount === null`, or no rules at all) falls back to
 * ALL levels of the version. This same resolved rule's `department_id` is
 * what `DEPT_HEAD` levels check against — if no rule matched (or the
 * matched rule has no `department_id`), a `DEPT_HEAD` level has no
 * resolvable department and therefore no legitimate approver (documented
 * limitation: a `DEPT_HEAD` level only ever works under department-scoped
 * routing rules).
 *
 * **Authorization** (`resolveAuthorizedActor`): an actor is authorized for
 * the instance's `current_level` if they are directly one of that level's
 * legitimate approvers (`ROLE` → currently holds the role, resolved via
 * `UsersService.listActiveUsersByRoleId()`; `USERS` → listed in `user_ids`;
 * `DEPT_HEAD` → `head_user_id` of the resolved department), OR they are the
 * one-hop
 * resolved delegate (`DelegationsService.resolveEffectiveApprover`, today's
 * date) of one of those legitimate approvers — in which case the action is
 * recorded with `was_delegated_from` set to that legitimate approver's id.
 * Self-approval (BR-APPR-01, "including via delegation or role overlap") is
 * rejected if `actorId === instance.initiator_id` directly, OR if the
 * *legitimate approver whose authority is being exercised* (`actorId`
 * itself, or whoever delegated to them) is the initiator — both checked at
 * the service layer as defense-in-depth ahead of `trg_appr_no_self_approval`
 * (migration `0050`), per G-04's three-layer rule.
 */
@Injectable()
export class ApprovalEngineService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workflowDefRepository: ApprWorkflowDefRepository,
    private readonly workflowVersionRepository: ApprWorkflowVersionRepository,
    private readonly levelRepository: ApprLevelRepository,
    private readonly routingRuleRepository: ApprRoutingRuleRepository,
    private readonly instanceRepository: ApprInstanceRepository,
    private readonly actionRepository: ApprActionRepository,
    private readonly usersService: UsersService,
    private readonly departmentsService: DepartmentsService,
    private readonly delegationsService: DelegationsService,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  /**
   * Attaches a new PENDING approval instance to a domain document. Takes the
   * CALLER's own `EntityManager` and never opens its own transaction — MUST
   * be called from inside the caller's own business transaction (same
   * pattern as `NumberingService.allocate()`), so a crash between "submit"
   * and "write the document" leaves neither half committed.
   *
   * Deliberately **no public `POST /approvals/instances` endpoint exists**
   * (see `InstancesController`'s doc comment) — submission is always an
   * internal service call composed into another module's own transaction,
   * exactly like `NumberingService.allocate()`'s reasoning: an approval
   * instance only makes sense attached to a document that is itself being
   * written in the same transaction, never created standalone.
   *
   * One-PENDING-per-entity is enforced by relying on the
   * `uq_appr_instance_open_p` partial unique index — this method does not
   * pre-check for an existing PENDING instance; it inserts and translates a
   * unique-violation into `ConflictException`.
   */
  async submit(em: EntityManager, input: SubmitApprovalInput): Promise<ApprInstanceEntity> {
    const workflowDef = await this.workflowDefRepository.findByDomainCode(input.domainCode, em);
    if (!workflowDef || !workflowDef.isActive) {
      throw new ValidationException(`No active appr_workflow_def registered for domain_code: ${input.domainCode}`);
    }
    const version = await this.workflowVersionRepository.findCurrent(workflowDef.id, em);
    if (!version) {
      throw new ValidationException(`No current appr_workflow_version published for domain_code: ${input.domainCode}`);
    }

    const amount = input.amount ?? null;
    const { levels } = await this.resolveApplicableLevels(em, version.id, amount, input.initiatorId);
    const firstLevel = levels[0];

    try {
      return await this.instanceRepository.create(
        {
          workflowVersionId: version.id,
          domainCode: input.domainCode,
          entityType: input.entityType,
          entityId: input.entityId,
          amount,
          initiatorId: input.initiatorId,
          status: "PENDING",
          currentLevel: firstLevel.seq,
          submittedAt: new Date(),
          decidedAt: null,
          createdBy: input.initiatorId,
          updatedBy: input.initiatorId,
        },
        em,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `An approval instance is already PENDING for ${input.entityType}/${input.entityId}`,
        );
      }
      throw error;
    }
  }

  /**
   * Records an `appr_action` and advances/resolves the instance. Opens its
   * own transaction via `tx()` — unlike `submit()`, this IS a public
   * mutation entrypoint (called directly by `InstancesController`), not
   * composed into another module's transaction.
   */
  async decide(
    instanceId: string,
    actorId: string,
    decision: ApprActionDecision,
    comment?: string | null,
  ): Promise<ApprInstanceEntity> {
    if ((decision === "REJECT" || decision === "RETURN") && !comment) {
      throw new ValidationException(`${decision} requires a comment (FR-APPR-003.1)`);
    }

    return runInTransaction(this.dataSource, async (manager) => {
      const instance = await this.instanceRepository.findByIdOrFail(instanceId, manager);
      if (instance.status !== "PENDING") {
        throw new ValidationException(
          `Cannot record a decision on a non-PENDING approval instance (status=${instance.status})`,
          { instanceId, status: instance.status },
        );
      }
      if (actorId === instance.initiatorId) {
        throw new AuthorizationException(
          "BR-APPR-01: an initiator can never approve, reject, or return their own request, at any level",
        );
      }

      const { levels, matchedRule } = await this.resolveApplicableLevels(
        manager,
        instance.workflowVersionId,
        instance.amount,
        instance.initiatorId,
      );
      const currentLevel = levels.find((level) => level.seq === instance.currentLevel);
      if (!currentLevel) {
        throw new Error(
          `ApprovalEngineService.decide: current_level ${instance.currentLevel} is not part of the resolved ` +
            `levels for instance ${instanceId} — data corruption or a workflow version edited after go-live`,
        );
      }

      const auth = await this.resolveAuthorizedActor(currentLevel, matchedRule, actorId);
      if (!auth.authorized) {
        throw new AuthorizationException(
          `Actor ${actorId} is not a legitimate approver (or delegate of one) for level ${currentLevel.seq}`,
        );
      }
      if (auth.legitimateApproverId === instance.initiatorId) {
        // BR-APPR-01 "including via delegation or role overlap" — the initiator holds the
        // approving role/seat themselves (directly or as who delegated authority to actorId).
        throw new AuthorizationException(
          "BR-APPR-01: an initiator can never approve their own request, including via delegation or role overlap",
        );
      }

      await this.actionRepository.create(
        {
          instanceId: instance.id,
          levelSeq: currentLevel.seq,
          actorId,
          decision,
          comment: comment ?? null,
          actedAt: new Date(),
          wasDelegatedFrom: auth.wasDelegatedFrom,
        },
        manager,
      );

      if (decision === "REJECT") {
        instance.status = "REJECTED";
        instance.decidedAt = new Date();
      } else if (decision === "RETURN") {
        instance.status = "RETURNED";
        instance.decidedAt = new Date();
      } else {
        let advances = true;
        if (currentLevel.mode === "PARALLEL") {
          const approvals = await this.actionRepository.countApprovalsAtLevel(instance.id, currentLevel.seq, manager);
          advances = approvals >= currentLevel.quorum;
        }
        if (advances) {
          const currentIndex = levels.findIndex((level) => level.seq === currentLevel.seq);
          const nextLevel = levels[currentIndex + 1];
          if (nextLevel) {
            instance.currentLevel = nextLevel.seq;
          } else {
            instance.status = "APPROVED";
            instance.decidedAt = new Date();
          }
        }
        // else: under quorum — instance stays PENDING at the same level.
      }

      instance.updatedBy = actorId;
      const saved = await this.instanceRepository.save(instance, manager);

      await this.outboxWriter.write(
        manager,
        new ApprovalDecidedEvent(saved.id, {
          instanceId: saved.id,
          domainCode: saved.domainCode,
          entityType: saved.entityType,
          entityId: saved.entityId,
          levelSeq: currentLevel.seq,
          actorId,
          decision,
          resultingStatus: saved.status,
          wasDelegatedFrom: auth.wasDelegatedFrom,
        }),
      );

      return saved;
    });
  }

  /**
   * Cancels a still-PENDING instance. Allowed for the initiator themselves,
   * or a privileged caller (`actorIsPrivileged` — `InstancesController`
   * resolves this from the caller's `System Admin` role membership; see that
   * controller's doc comment for why a role-name check stands in for a real
   * per-request resolved-permission-set lookup, which doesn't exist yet in
   * this codebase's JWT claims).
   */
  async cancel(instanceId: string, actorId: string, actorIsPrivileged = false): Promise<ApprInstanceEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const instance = await this.instanceRepository.findByIdOrFail(instanceId, manager);
      if (instance.status !== "PENDING") {
        throw new ValidationException(
          `Cannot cancel a non-PENDING approval instance (status=${instance.status})`,
          { instanceId, status: instance.status },
        );
      }
      if (actorId !== instance.initiatorId && !actorIsPrivileged) {
        throw new AuthorizationException(
          "Only the initiator, or a privileged caller, can cancel a pending approval instance",
        );
      }

      instance.status = "CANCELLED";
      instance.decidedAt = new Date();
      instance.updatedBy = actorId;
      const saved = await this.instanceRepository.save(instance, manager);

      await this.outboxWriter.write(
        manager,
        new ApprovalDecidedEvent(saved.id, {
          instanceId: saved.id,
          domainCode: saved.domainCode,
          entityType: saved.entityType,
          entityId: saved.entityId,
          levelSeq: saved.currentLevel,
          actorId,
          decision: "CANCEL",
          resultingStatus: saved.status,
          wasDelegatedFrom: null,
        }),
      );

      return saved;
    });
  }

  /** The FR-APPR-007.1 "verify approval_ref before posting" lookup — most recent instance for the entity, PENDING or otherwise, or `null` if none was ever submitted. */
  async getStatus(entityType: string, entityId: string): Promise<ApprInstanceEntity | null> {
    return this.instanceRepository.findLatestByEntity(entityType, entityId);
  }

  async findByIdOrFail(instanceId: string): Promise<ApprInstanceEntity> {
    return this.instanceRepository.findByIdOrFail(instanceId);
  }

  async list(filter: ListInstancesFilter): Promise<ApprInstanceEntity[]> {
    return this.instanceRepository.list(filter);
  }

  async getActionHistory(instanceId: string): Promise<ApprActionEntity[]> {
    return this.actionRepository.listByInstance(instanceId);
  }

  /** Resolves which PENDING instances `userId` can currently act on (approval inbox), across all approver types and honoring delegation. */
  async listPendingForApprover(userId: string): Promise<ApprInstanceEntity[]> {
    const pending = await this.instanceRepository.listPending();
    const actionable: ApprInstanceEntity[] = [];

    for (const instance of pending) {
      if (instance.initiatorId === userId) continue; // BR-APPR-01 — never actionable by its own initiator

      const { levels, matchedRule } = await this.resolveApplicableLevels(
        undefined,
        instance.workflowVersionId,
        instance.amount,
        instance.initiatorId,
      );
      const currentLevel = levels.find((level) => level.seq === instance.currentLevel);
      if (!currentLevel) continue;

      const auth = await this.resolveAuthorizedActor(currentLevel, matchedRule, userId);
      if (auth.authorized && auth.legitimateApproverId !== instance.initiatorId) {
        actionable.push(instance);
      }
    }

    return actionable;
  }

  // ---- Routing/authorization resolution (shared by submit/decide/inbox) ----

  private async resolveApplicableLevels(
    manager: EntityManager | undefined,
    workflowVersionId: string,
    amount: Money | null,
    initiatorId: string,
  ): Promise<RoutingResolution> {
    const allLevels = await this.levelRepository.listByVersion(workflowVersionId, manager);
    if (allLevels.length === 0) {
      throw new ValidationException(`Workflow version ${workflowVersionId} has no levels configured`);
    }

    const rules = await this.routingRuleRepository.listByVersion(workflowVersionId, manager);

    let matchedRule: ApprRoutingRuleEntity | null = null;
    if (amount !== null && rules.length > 0) {
      const initiator = await this.usersService.findByIdOrFail(initiatorId);
      matchedRule =
        rules.find((rule) => {
          const meetsMin = amount.compare(rule.minAmount) >= 0;
          const meetsMax = rule.maxAmount === null || amount.compare(rule.maxAmount) < 0;
          const meetsDept = rule.departmentId === null || rule.departmentId === initiator.departmentId;
          return meetsMin && meetsMax && meetsDept;
        }) ?? null;
    }

    if (!matchedRule || matchedRule.levelSubset === null) {
      return { levels: allLevels, matchedRule };
    }

    const subsetSeqs = new Set(matchedRule.levelSubset);
    const filtered = allLevels.filter((level) => subsetSeqs.has(level.seq));
    if (filtered.length === 0) {
      throw new ValidationException(
        `appr_routing_rule ${matchedRule.id} level_subset matches no levels in workflow version ${workflowVersionId}`,
      );
    }
    return { levels: filtered, matchedRule };
  }

  private async legitimateApproverIds(
    level: ApprLevelEntity,
    matchedRule: ApprRoutingRuleEntity | null,
  ): Promise<string[]> {
    switch (level.approverType) {
      case "ROLE": {
        if (!level.roleId) return [];
        const users = await this.usersService.listActiveUsersByRoleId(level.roleId);
        return users.map((user) => user.id);
      }
      case "USERS":
        return level.userIds ?? [];
      case "DEPT_HEAD": {
        const departmentId = matchedRule?.departmentId ?? null;
        if (!departmentId) return [];
        const department = await this.departmentsService.findByIdOrFail(departmentId);
        return department.headUserId ? [department.headUserId] : [];
      }
      /* istanbul ignore next -- exhaustive over ApprLevelApproverType, unreachable at the type level */
      default: {
        const exhaustive: never = level.approverType;
        throw new ValidationException(`Unknown approver_type: ${String(exhaustive)}`);
      }
    }
  }

  private async resolveAuthorizedActor(
    level: ApprLevelEntity,
    matchedRule: ApprRoutingRuleEntity | null,
    actorId: string,
  ): Promise<AuthorizationResult> {
    const candidateIds = await this.legitimateApproverIds(level, matchedRule);

    if (candidateIds.includes(actorId)) {
      return { authorized: true, legitimateApproverId: actorId, wasDelegatedFrom: null };
    }

    const today = new Date();
    for (const candidateId of candidateIds) {
      const effectiveApprover = await this.delegationsService.resolveEffectiveApprover(candidateId, today);
      if (effectiveApprover === actorId) {
        return { authorized: true, legitimateApproverId: candidateId, wasDelegatedFrom: candidateId };
      }
    }

    return { authorized: false, legitimateApproverId: null, wasDelegatedFrom: null };
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}
