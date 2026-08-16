import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { PyrlOneoffEntity, PyrlOneoffKind } from "../domain/pyrl-oneoff.entity";
import { PyrlOneoffRepository } from "../infrastructure/pyrl-oneoff.repository";

export interface CreatePyrlOneoffInput {
  employeeId: string;
  periodKey: string;
  kind: PyrlOneoffKind;
  componentId: string;
  amount: Money;
  reason: string;
}

export interface UpdatePyrlOneoffInput {
  amount?: Money;
  reason?: string;
}

/**
 * CRUD for `pyrl_oneoff` (Module 15 PASS B) — a small, previously-missing
 * gap-closer: PASS A built the entity/repository for `pyrl_oneoff` but no
 * application service (`docs/phase-5/PROGRESS.md`'s PASS A row lists 8
 * services, none named "oneoffs"), yet `PayrollRunsService.compute()`
 * (this same pass) reads `pyrl_oneoff` rows as a real input — without this
 * service (and its controller), a one-off bonus/deduction could never
 * actually be entered via the API. Plain CRUD, `uq(employee_id, period_key,
 * component_id)` (`0130`'s own DDL uniqueness rule) enforced by the DB, not
 * pre-checked here (same "let the DB be the source of truth" discipline
 * `EmployeeAssignmentsService`/`EmployeeComponentsService` apply to their own
 * EXCLUDE constraints, though this one is a plain unique index, so a
 * duplicate simply surfaces as a raw Postgres unique-violation rather than a
 * translated `ConflictException` — a narrower, lower-stakes gap than the
 * EXCLUDE-constraint cases, since `pyrl_oneoff` rows are edited/removed
 * freely pre-consumption per the entity's own doc comment, not a
 * concurrency-sensitive effective-dated timeline).
 */
@Injectable()
export class OneoffsService {
  constructor(private readonly oneoffRepository: PyrlOneoffRepository) {}

  async create(input: CreatePyrlOneoffInput, actorId: string | null): Promise<PyrlOneoffEntity> {
    try {
      return await this.oneoffRepository.create({
        employeeId: input.employeeId,
        periodKey: input.periodKey,
        kind: input.kind,
        componentId: input.componentId,
        amount: input.amount,
        reason: input.reason,
        approvalRef: null,
        createdBy: actorId,
        updatedBy: actorId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `pyrl_oneoff: a one-off already exists for employee ${input.employeeId}, period ${input.periodKey}, component ${input.componentId}`,
        );
      }
      throw error;
    }
  }

  async update(id: string, input: UpdatePyrlOneoffInput, actorId: string | null): Promise<PyrlOneoffEntity> {
    const row = await this.oneoffRepository.findByIdOrFail(id);
    if (input.amount !== undefined) row.amount = input.amount;
    if (input.reason !== undefined) row.reason = input.reason;
    row.updatedBy = actorId;
    return this.oneoffRepository.save(row);
  }

  async get(id: string): Promise<PyrlOneoffEntity> {
    return this.oneoffRepository.findByIdOrFail(id);
  }

  async listByEmployeeAndPeriod(employeeId: string, periodKey: string): Promise<PyrlOneoffEntity[]> {
    return this.oneoffRepository.findByEmployeeAndPeriod(employeeId, periodKey);
  }

  async listByPeriod(periodKey: string): Promise<PyrlOneoffEntity[]> {
    return this.oneoffRepository.listByPeriod(periodKey);
  }

  async delete(id: string): Promise<void> {
    const row = await this.oneoffRepository.findByIdOrFail(id);
    await this.oneoffRepository.delete(row.id);
  }
}

/** Postgres unique_violation SQLSTATE — raised by `uq_pyrl_oneoff_employee_period_component` (confirmed via `packages/server/src/migrations/0130-create-payroll-tables.ts:395`) on a duplicate `(employee_id, period_key, component_id)`. Same isolation/translation discipline `ComponentsService.create()` (Slice 22 Part 1)/`SalaryStructuresService.create()` (Slice 22 Part 2) already establish elsewhere in this codebase for their own unique constraints — this part's own opportunistic backend fix (Slice 22 Part 6). */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === "23505";
}
