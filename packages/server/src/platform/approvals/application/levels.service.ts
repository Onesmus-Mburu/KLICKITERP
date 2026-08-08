import { Injectable } from "@nestjs/common";
import { ApprLevelApproverType, ApprLevelEntity, ApprLevelMode } from "../domain/appr-level.entity";
import { ApprLevelRepository } from "../infrastructure/appr-level.repository";

export interface CreateLevelInput {
  workflowVersionId: string;
  seq: number;
  approverType: ApprLevelApproverType;
  roleId?: string | null;
  userIds?: string[] | null;
  mode: ApprLevelMode;
  quorum?: number;
  slaHours?: number | null;
  escalation?: Record<string, unknown> | null;
}

export interface UpdateLevelInput {
  approverType?: ApprLevelApproverType;
  roleId?: string | null;
  userIds?: string[] | null;
  mode?: ApprLevelMode;
  quorum?: number;
  slaHours?: number | null;
  escalation?: Record<string, unknown> | null;
}

/**
 * CRUD for `appr_level`, scoped to a single `workflow_version_id`. Most
 * levels are created in bulk via `WorkflowVersionsService.publishNewVersion()`
 * — this service exists for direct inspection/editing of an individual level
 * (e.g. correcting a typo in a not-yet-current draft version) rather than the
 * primary authoring path.
 */
@Injectable()
export class LevelsService {
  constructor(private readonly levelRepository: ApprLevelRepository) {}

  async create(input: CreateLevelInput, actorId: string | null): Promise<ApprLevelEntity> {
    return this.levelRepository.create({
      workflowVersionId: input.workflowVersionId,
      seq: input.seq,
      approverType: input.approverType,
      roleId: input.roleId ?? null,
      userIds: input.userIds ?? null,
      mode: input.mode,
      quorum: input.quorum ?? 1,
      slaHours: input.slaHours ?? null,
      escalation: input.escalation ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async listByVersion(workflowVersionId: string): Promise<ApprLevelEntity[]> {
    return this.levelRepository.listByVersion(workflowVersionId);
  }

  async findByIdOrFail(id: string): Promise<ApprLevelEntity> {
    return this.levelRepository.findByIdOrFail(id);
  }

  async update(id: string, changes: UpdateLevelInput, actorId: string | null): Promise<ApprLevelEntity> {
    const level = await this.levelRepository.findByIdOrFail(id);
    if (changes.approverType !== undefined) level.approverType = changes.approverType;
    if (changes.roleId !== undefined) level.roleId = changes.roleId;
    if (changes.userIds !== undefined) level.userIds = changes.userIds;
    if (changes.mode !== undefined) level.mode = changes.mode;
    if (changes.quorum !== undefined) level.quorum = changes.quorum;
    if (changes.slaHours !== undefined) level.slaHours = changes.slaHours;
    if (changes.escalation !== undefined) level.escalation = changes.escalation;
    level.updatedBy = actorId;
    return this.levelRepository.save(level);
  }
}
