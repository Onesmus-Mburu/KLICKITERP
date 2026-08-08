import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { PyrlEmployeeComponentEntity } from "../domain/pyrl-employee-component.entity";
import { PyrlEmployeeComponentRepository } from "../infrastructure/pyrl-employee-component.repository";

/** Postgres exclusion_violation SQLSTATE — raised by `excl_pyrl_employee_component_no_overlap` (migration `0130`). */
const PG_EXCLUSION_VIOLATION = "23P01";

export interface AddEmployeeComponentInput {
  employeeId: string;
  componentId: string;
  amount: Money;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

/**
 * `pyrl_employee_component` management (Module 15 PASS A) — an employee's
 * personal allowance/deduction override, effective-dated.
 *
 * Same EXCLUDE-violation-to-`ConflictException` and close-out-the-open-ended-
 * row-first discipline `EmployeeAssignmentsService` documents, scoped here to
 * `(employee_id, component_id)` (`excl_pyrl_employee_component_no_overlap`
 * — see that constraint's own doc comment on `PyrlEmployeeComponentEntity`
 * for why the SAME employee CAN hold two overlapping ranges for two
 * DIFFERENT components concurrently, e.g. housing + transport allowance).
 */
@Injectable()
export class EmployeeComponentsService {
  constructor(private readonly employeeComponentRepository: PyrlEmployeeComponentRepository) {}

  async add(em: EntityManager, input: AddEmployeeComponentInput): Promise<PyrlEmployeeComponentEntity> {
    try {
      return await this.employeeComponentRepository.create(
        {
          employeeId: input.employeeId,
          componentId: input.componentId,
          amount: input.amount,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
        },
        em,
      );
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictException(
          `pyrl_employee_component: overlapping period for employee ${input.employeeId}/component ${input.componentId}`,
        );
      }
      throw error;
    }
  }

  async getActiveFor(
    employeeId: string,
    date: string,
    em?: EntityManager,
  ): Promise<PyrlEmployeeComponentEntity[]> {
    return this.employeeComponentRepository.findActiveFor(employeeId, date, em);
  }

  async listByEmployee(employeeId: string, em?: EntityManager): Promise<PyrlEmployeeComponentEntity[]> {
    return this.employeeComponentRepository.findByEmployeeId(employeeId, em);
  }

  /** Closes out the open-ended override (`effective_to IS NULL`) for `(employeeId, componentId)` — see class doc comment. */
  async endOverride(
    employeeId: string,
    componentId: string,
    effectiveTo: string,
    em?: EntityManager,
  ): Promise<PyrlEmployeeComponentEntity> {
    const rows = await this.employeeComponentRepository.findByEmployeeId(employeeId, em);
    const open = rows.find((row) => row.componentId === componentId && row.effectiveTo === null);
    if (!open) {
      throw new NotFoundException(
        "PyrlEmployeeComponent",
        `open-ended override for employee ${employeeId}/component ${componentId}`,
      );
    }
    open.effectiveTo = effectiveTo;
    return this.employeeComponentRepository.save(open, em);
  }
}

function isExclusionViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_EXCLUSION_VIOLATION;
}
