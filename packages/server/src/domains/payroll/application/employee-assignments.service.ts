import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { PyrlEmployeeAssignmentEntity } from "../domain/pyrl-employee-assignment.entity";
import { PyrlEmployeeAssignmentRepository } from "../infrastructure/pyrl-employee-assignment.repository";

/** Postgres exclusion_violation SQLSTATE — raised by `excl_pyrl_employee_assignment_no_overlap` (migration `0130`). */
const PG_EXCLUSION_VIOLATION = "23P01";

export interface AssignEmployeeInput {
  employeeId: string;
  structureId: string;
  basicPay: Money;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

/**
 * `pyrl_employee_assignment` management (Module 15 PASS A) — assigns an
 * employee onto a salary structure for an effective-dated period.
 *
 * **EXCLUDE-violation-to-`ConflictException` translation**: `assign()`
 * deliberately does NOT pre-check for an overlapping row before inserting —
 * it relies on `excl_pyrl_employee_assignment_no_overlap` (the DB's own
 * source of truth, migration `0130`) and translates a `23P01`
 * (exclusion_violation) into a `ConflictException`, the same discipline
 * `ApprovalEngineService.submit()`/`NumberingService.allocate()` apply to
 * `23505` (unique_violation) — a pre-check-then-insert would race under
 * concurrent callers exactly the way those two services' own doc comments
 * explain for unique-violation races.
 *
 * **`endAssignment()`** — closes out the currently open-ended assignment
 * (`effective_to IS NULL`) by setting its `effective_to` IN PLACE, the real
 * workflow step the EXCLUDE constraint otherwise makes mandatory: a new
 * assignment cannot be created while an open-ended one still covers the
 * same employee, so ending the old one first is how a structure/basic-pay
 * change is actually applied in practice.
 */
@Injectable()
export class EmployeeAssignmentsService {
  constructor(private readonly assignmentRepository: PyrlEmployeeAssignmentRepository) {}

  async assign(em: EntityManager, input: AssignEmployeeInput): Promise<PyrlEmployeeAssignmentEntity> {
    try {
      return await this.assignmentRepository.create(
        {
          employeeId: input.employeeId,
          structureId: input.structureId,
          basicPay: input.basicPay,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
        },
        em,
      );
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictException(
          `pyrl_employee_assignment: overlapping assignment period for employee ${input.employeeId}`,
        );
      }
      throw error;
    }
  }

  async getActiveFor(
    employeeId: string,
    date: string,
    em?: EntityManager,
  ): Promise<PyrlEmployeeAssignmentEntity | null> {
    return this.assignmentRepository.findActiveFor(employeeId, date, em);
  }

  async listByEmployee(employeeId: string, em?: EntityManager): Promise<PyrlEmployeeAssignmentEntity[]> {
    return this.assignmentRepository.findByEmployeeId(employeeId, em);
  }

  /** Closes out the employee's currently open-ended assignment (`effective_to IS NULL`) — see class doc comment. */
  async endAssignment(
    employeeId: string,
    effectiveTo: string,
    em?: EntityManager,
  ): Promise<PyrlEmployeeAssignmentEntity> {
    const rows = await this.assignmentRepository.findByEmployeeId(employeeId, em);
    const open = rows.find((row) => row.effectiveTo === null);
    if (!open) {
      throw new NotFoundException("PyrlEmployeeAssignment", `open-ended assignment for employee ${employeeId}`);
    }
    open.effectiveTo = effectiveTo;
    return this.assignmentRepository.save(open, em);
  }
}

function isExclusionViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_EXCLUSION_VIOLATION;
}
