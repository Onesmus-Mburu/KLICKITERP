import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PyrlSalaryStructureEntity } from "../domain/pyrl-salary-structure.entity";
import { PyrlStructureComponentEntity } from "../domain/pyrl-structure-component.entity";
import { PyrlSalaryStructureRepository } from "../infrastructure/pyrl-salary-structure.repository";
import { PyrlStructureComponentRepository } from "../infrastructure/pyrl-structure-component.repository";

export interface CreatePyrlSalaryStructureInput {
  name: string;
  grade?: string | null;
  effectiveFrom: string;
}

export interface UpdatePyrlSalaryStructureInput {
  name?: string;
  grade?: string | null;
  effectiveFrom?: string;
}

/**
 * Documented `pyrl_structure_component.amount|formula` jsonb contract —
 * word-for-word depended on by `resolveComponentAmount()` below and by Pass
 * B's run-computation engine (task brief: "the exact `params`/formula shape
 * Pass B must match"). Only ever ONE of the entity's own `amount` column
 * (Money, `type: 'FIXED'`) or `formula` column (this jsonb, `type:
 * 'PERCENT_OF_BASIC'`) is set per row (the DDL's own CHECK constraint) — the
 * `FIXED` variant of this union exists so `resolveLineAmount()` can hand
 * EITHER storage location to the SAME pure function, giving Pass B one
 * uniform resolution path regardless of which column a line actually used.
 *
 * - `{ type: 'FIXED', amount: string }` — a flat KES amount (decimal
 *   string, `Money.fromDecimalString`-compatible), independent of basic pay.
 * - `{ type: 'PERCENT_OF_BASIC', rate: string }` — `rate` is a decimal
 *   FRACTION (e.g. `"0.15"` for 15%), not a whole-number percentage;
 *   resolves to `basicPay × rate` (HALF_EVEN — the tax/proportional-split
 *   rounding mode `shared/money/money.ts`'s own rounding matrix names for
 *   this kind of proportional computation).
 */
export type StructureComponentFormula =
  | { type: "FIXED"; amount: string }
  | { type: "PERCENT_OF_BASIC"; rate: string };

/** Pure function — no I/O, no DB. THE contract Pass B's run-computation engine calls to resolve one structure-component line's amount for a given basic pay. */
export function resolveComponentAmount(basicPay: Money, formula: StructureComponentFormula): Money {
  switch (formula.type) {
    case "FIXED":
      return Money.fromDecimalString(formula.amount);
    case "PERCENT_OF_BASIC":
      return basicPay.multiply(formula.rate);
    /* istanbul ignore next -- exhaustive over StructureComponentFormula, unreachable at the type level */
    default: {
      const exhaustive: never = formula;
      throw new ValidationException(`Unknown structure-component formula type: ${String((exhaustive as { type: unknown }).type)}`);
    }
  }
}

export interface CreateStructureComponentLineInput {
  componentId: string;
  /** Exactly one of `amount`/`formula` must be set — mirrors `ck_pyrl_structure_component_amount_or_formula`. */
  amount?: Money | null;
  formula?: StructureComponentFormula | null;
}

export interface UpdateStructureComponentLineInput {
  amount?: Money | null;
  formula?: StructureComponentFormula | null;
}

/**
 * CRUD for `pyrl_salary_structure` + `pyrl_structure_component` (Module 15
 * PASS A). `resolveLineAmount()` is the service-layer convenience wrapper
 * around the standalone `resolveComponentAmount()` pure function — it reads
 * whichever of the line's own `amount`/`formula` columns is set and hands it
 * to that function in the documented `StructureComponentFormula` shape.
 */
@Injectable()
export class SalaryStructuresService {
  constructor(
    private readonly structureRepository: PyrlSalaryStructureRepository,
    private readonly lineRepository: PyrlStructureComponentRepository,
  ) {}

  async create(input: CreatePyrlSalaryStructureInput, actorId: string | null): Promise<PyrlSalaryStructureEntity> {
    return this.structureRepository.create({
      name: input.name,
      grade: input.grade ?? null,
      effectiveFrom: input.effectiveFrom,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async update(
    id: string,
    input: UpdatePyrlSalaryStructureInput,
    actorId: string | null,
  ): Promise<PyrlSalaryStructureEntity> {
    const row = await this.structureRepository.findByIdOrFail(id);
    if (input.name !== undefined) row.name = input.name;
    if (input.grade !== undefined) row.grade = input.grade;
    if (input.effectiveFrom !== undefined) row.effectiveFrom = input.effectiveFrom;
    row.updatedBy = actorId;
    return this.structureRepository.save(row);
  }

  async get(id: string): Promise<PyrlSalaryStructureEntity> {
    return this.structureRepository.findByIdOrFail(id);
  }

  async list(): Promise<PyrlSalaryStructureEntity[]> {
    return this.structureRepository.list();
  }

  async addLine(
    structureId: string,
    input: CreateStructureComponentLineInput,
    actorId: string | null,
  ): Promise<PyrlStructureComponentEntity> {
    this.assertExactlyOneOfAmountOrFormula(input.amount, input.formula);
    await this.structureRepository.findByIdOrFail(structureId);
    return this.lineRepository.create({
      structureId,
      componentId: input.componentId,
      amount: input.amount ?? null,
      formula: (input.formula as unknown as Record<string, unknown>) ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async updateLine(
    lineId: string,
    input: UpdateStructureComponentLineInput,
    actorId: string | null,
  ): Promise<PyrlStructureComponentEntity> {
    const row = await this.lineRepository.findByIdOrFail(lineId);
    const nextAmount = input.amount !== undefined ? input.amount : row.amount;
    const nextFormula = input.formula !== undefined ? input.formula : (row.formula as StructureComponentFormula | null);
    this.assertExactlyOneOfAmountOrFormula(nextAmount, nextFormula);
    row.amount = nextAmount;
    row.formula = (nextFormula as unknown as Record<string, unknown>) ?? null;
    row.updatedBy = actorId;
    return this.lineRepository.save(row);
  }

  async removeLine(lineId: string): Promise<void> {
    await this.lineRepository.findByIdOrFail(lineId);
    await this.lineRepository.delete(lineId);
  }

  async listLines(structureId: string): Promise<PyrlStructureComponentEntity[]> {
    return this.lineRepository.findByStructureId(structureId);
  }

  /** Resolves one line's amount for a given basic pay — reads whichever of `amount`/`formula` is set and delegates to `resolveComponentAmount()`. */
  resolveLineAmount(line: PyrlStructureComponentEntity, basicPay: Money): Money {
    if (line.amount !== null) {
      return resolveComponentAmount(basicPay, { type: "FIXED", amount: line.amount.toDecimalString() });
    }
    if (!line.formula) {
      throw new ValidationException(`pyrl_structure_component ${line.id} has neither amount nor formula set`);
    }
    return resolveComponentAmount(basicPay, line.formula as unknown as StructureComponentFormula);
  }

  private assertExactlyOneOfAmountOrFormula(
    amount: Money | null | undefined,
    formula: StructureComponentFormula | null | undefined,
  ): void {
    const hasAmount = amount !== null && amount !== undefined;
    const hasFormula = formula !== null && formula !== undefined;
    if (hasAmount === hasFormula) {
      throw new ValidationException(
        "pyrl_structure_component requires exactly one of amount/formula (ck_pyrl_structure_component_amount_or_formula)",
      );
    }
  }
}
