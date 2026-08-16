import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { PyrlComponentEntity, PyrlComponentKind } from "../domain/pyrl-component.entity";
import { ListPyrlComponentsFilter, PyrlComponentRepository } from "../infrastructure/pyrl-component.repository";

export interface CreatePyrlComponentInput {
  code: string;
  name: string;
  kind: PyrlComponentKind;
  isTaxable: boolean;
  isStatutory?: boolean;
  glAccountId: string;
}

export interface UpdatePyrlComponentInput {
  name?: string;
  isTaxable?: boolean;
  isStatutory?: boolean;
  glAccountId?: string;
}

/** CRUD for `pyrl_component` — the payroll earning/deduction line-type catalogue (Module 15 PASS A). */
@Injectable()
export class ComponentsService {
  constructor(private readonly componentRepository: PyrlComponentRepository) {}

  async create(input: CreatePyrlComponentInput, actorId: string | null): Promise<PyrlComponentEntity> {
    try {
      return await this.componentRepository.create({
        code: input.code,
        name: input.name,
        kind: input.kind,
        isTaxable: input.isTaxable,
        isStatutory: input.isStatutory ?? false,
        glAccountId: input.glAccountId,
        createdBy: actorId,
        updatedBy: actorId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`pyrl_component: code "${input.code}" already exists`);
      }
      throw error;
    }
  }

  async update(id: string, input: UpdatePyrlComponentInput, actorId: string | null): Promise<PyrlComponentEntity> {
    const row = await this.componentRepository.findByIdOrFail(id);
    if (input.name !== undefined) row.name = input.name;
    if (input.isTaxable !== undefined) row.isTaxable = input.isTaxable;
    if (input.isStatutory !== undefined) row.isStatutory = input.isStatutory;
    if (input.glAccountId !== undefined) row.glAccountId = input.glAccountId;
    row.updatedBy = actorId;
    return this.componentRepository.save(row);
  }

  async get(id: string): Promise<PyrlComponentEntity> {
    return this.componentRepository.findByIdOrFail(id);
  }

  async getByCode(code: string): Promise<PyrlComponentEntity | null> {
    return this.componentRepository.findByCode(code);
  }

  async list(filter: ListPyrlComponentsFilter = {}): Promise<PyrlComponentEntity[]> {
    return this.componentRepository.list(filter);
  }
}

/** Postgres unique_violation SQLSTATE — raised by `uq_pyrl_component_code` on a duplicate `code`. Same isolation/translation discipline `BankAccountsService`/`EmployeeAssignmentsService` already establish elsewhere in this codebase for their own unique/exclusion constraints. */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === "23505";
}
