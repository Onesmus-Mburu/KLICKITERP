import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlStatutoryKind, PyrlStatutoryTableEntity } from "../domain/pyrl-statutory-table.entity";
import { PyrlStatutoryTableRepository } from "../infrastructure/pyrl-statutory-table.repository";

export interface CreatePyrlStatutoryTableInput {
  kind: PyrlStatutoryKind;
  effectiveFrom: string;
  params: Record<string, unknown>;
  sourceNote: string;
}

export interface UpdatePyrlStatutoryTableInput {
  params?: Record<string, unknown>;
  sourceNote?: string;
}

/**
 * CRUD for `pyrl_statutory_table` (Module 15 PASS A, FR-PYRL-003:
 * "admin-editable, never hardcoded"). `findEffectiveFor()` is BR-PYRL-01's
 * exact lookup, wrapping `PyrlStatutoryTableRepository.findEffectiveFor()`
 * (latest `effective_from <= periodEndDate`) and turning a `null` result
 * into the named `NotFoundException` BR-PYRL-01 requires ("missing table for
 * a period blocks the run with a named error") — this is the single
 * enforcement point `StatutoryCalculationService`'s four `compute*()`
 * methods all funnel through.
 */
@Injectable()
export class StatutoryTablesService {
  constructor(private readonly statutoryTableRepository: PyrlStatutoryTableRepository) {}

  async create(input: CreatePyrlStatutoryTableInput, actorId: string | null): Promise<PyrlStatutoryTableEntity> {
    try {
      return await this.statutoryTableRepository.create({
        kind: input.kind,
        effectiveFrom: input.effectiveFrom,
        params: input.params,
        sourceNote: input.sourceNote,
        createdBy: actorId,
        updatedBy: actorId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`pyrl_statutory_table: a ${input.kind} table already exists effective ${input.effectiveFrom}`);
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdatePyrlStatutoryTableInput,
    actorId: string | null,
  ): Promise<PyrlStatutoryTableEntity> {
    const row = await this.statutoryTableRepository.findByIdOrFail(id);
    if (input.params !== undefined) row.params = input.params;
    if (input.sourceNote !== undefined) row.sourceNote = input.sourceNote;
    row.updatedBy = actorId;
    return this.statutoryTableRepository.save(row);
  }

  async get(id: string): Promise<PyrlStatutoryTableEntity> {
    return this.statutoryTableRepository.findByIdOrFail(id);
  }

  async listByKind(kind: PyrlStatutoryKind): Promise<PyrlStatutoryTableEntity[]> {
    return this.statutoryTableRepository.listByKind(kind);
  }

  /** BR-PYRL-01: throws `NotFoundException` (the named "missing table blocks the run" error) when no row is effective for `periodEndDate`. */
  async findEffectiveFor(kind: PyrlStatutoryKind, periodEndDate: string): Promise<PyrlStatutoryTableEntity> {
    const row = await this.statutoryTableRepository.findEffectiveFor(kind, periodEndDate);
    if (!row) {
      throw new NotFoundException(
        "PyrlStatutoryTable",
        `no ${kind} rate table effective on or before ${periodEndDate} (BR-PYRL-01)`,
      );
    }
    return row;
  }
}

/** Postgres unique_violation SQLSTATE — raised by `uq_pyrl_statutory_table_kind_effective_from` (`packages/server/src/migrations/0130-create-payroll-tables.ts:234`) on a duplicate `(kind, effective_from)`. Same isolation/translation discipline `ComponentsService`/`SalaryStructuresService` already establish elsewhere in this codebase (Slice 22 Parts 1-2) for their own unique constraints. */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === "23505";
}
