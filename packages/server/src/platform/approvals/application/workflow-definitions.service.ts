import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ApprWorkflowDefEntity } from "../domain/appr-workflow-def.entity";
import { ApprWorkflowDefRepository } from "../infrastructure/appr-workflow-def.repository";

export interface CreateWorkflowDefInput {
  domainCode: string;
  name: string;
  isActive?: boolean;
}

export interface UpdateWorkflowDefInput {
  name?: string;
  isActive?: boolean;
}

/**
 * CRUD for `appr_workflow_def`, keyed by its unique `domain_code` — the
 * string other modules use to look up their workflow (e.g.
 * `'BILLING_WAIVER'`, `'PAYMENT_VOUCHER'`, `'PROCUREMENT_PO'`,
 * `'PAYROLL_RUN'`, `'JOURNAL_ENTRY'`). This is a documented *open* string
 * namespace — there is no CHECK constraint on `domain_code`, deliberately:
 * any future module can register its own workflow definition without a
 * migration touching this table's schema. `ApprovalEngineService.submit()`
 * looks up the workflow's *current* `appr_workflow_version` by this code.
 */
@Injectable()
export class WorkflowDefinitionsService {
  constructor(private readonly workflowDefRepository: ApprWorkflowDefRepository) {}

  async create(input: CreateWorkflowDefInput, actorId: string | null): Promise<ApprWorkflowDefEntity> {
    if (await this.workflowDefRepository.findByDomainCode(input.domainCode)) {
      throw new ConflictException(`domain_code already registered: ${input.domainCode}`);
    }
    return this.workflowDefRepository.create({
      domainCode: input.domainCode,
      name: input.name,
      isActive: input.isActive ?? true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(): Promise<ApprWorkflowDefEntity[]> {
    return this.workflowDefRepository.list();
  }

  async findByIdOrFail(id: string): Promise<ApprWorkflowDefEntity> {
    return this.workflowDefRepository.findByIdOrFail(id);
  }

  async findByDomainCode(domainCode: string): Promise<ApprWorkflowDefEntity | null> {
    return this.workflowDefRepository.findByDomainCode(domainCode);
  }

  async findByDomainCodeOrFail(domainCode: string): Promise<ApprWorkflowDefEntity> {
    const found = await this.workflowDefRepository.findByDomainCode(domainCode);
    if (!found) {
      throw new ConflictException(`No appr_workflow_def registered for domain_code: ${domainCode}`);
    }
    return found;
  }

  async update(id: string, changes: UpdateWorkflowDefInput, actorId: string | null): Promise<ApprWorkflowDefEntity> {
    const def = await this.workflowDefRepository.findByIdOrFail(id);
    if (changes.name !== undefined) def.name = changes.name;
    if (changes.isActive !== undefined) def.isActive = changes.isActive;
    def.updatedBy = actorId;
    return this.workflowDefRepository.save(def);
  }
}
