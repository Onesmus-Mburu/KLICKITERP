import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlEmployeeAssignmentEntity } from "../domain/pyrl-employee-assignment.entity";

/**
 * Plain repository wrapper for `pyrl_employee_assignment`, plus
 * `findActiveFor()` — the assignment covering a given date (at most one, by
 * `excl_pyrl_employee_assignment_no_overlap`), the entry point the next
 * pass's computation engine needs to resolve an employee's current
 * structure/basic pay.
 */
@Injectable()
export class PyrlEmployeeAssignmentRepository {
  constructor(
    @InjectRepository(PyrlEmployeeAssignmentEntity)
    private readonly repo: Repository<PyrlEmployeeAssignmentEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlEmployeeAssignmentEntity | null> {
    return (manager?.getRepository(PyrlEmployeeAssignmentEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlEmployeeAssignmentEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlEmployeeAssignment", id);
    return row;
  }

  /** All assignment rows for an employee, most recent `effective_from` first — full history view. */
  async findByEmployeeId(
    employeeId: string,
    manager?: EntityManager,
  ): Promise<PyrlEmployeeAssignmentEntity[]> {
    return (manager?.getRepository(PyrlEmployeeAssignmentEntity) ?? this.repo).find({
      where: { employeeId },
      order: { effectiveFrom: "DESC" },
    });
  }

  /**
   * The assignment active on `date` (`effective_from <= date <=
   * effective_to`, or `effective_to IS NULL` for an open-ended assignment)
   * — BR-PYRL-adjacent lookup (see `PyrlEmployeeAssignmentEntity`'s own
   * doc comment for the no-overlap constraint this relies on holding at
   * most one row). `null` if the employee has no assignment covering that
   * date.
   */
  async findActiveFor(
    employeeId: string,
    date: string,
    manager?: EntityManager,
  ): Promise<PyrlEmployeeAssignmentEntity | null> {
    return (manager?.getRepository(PyrlEmployeeAssignmentEntity) ?? this.repo)
      .createQueryBuilder("a")
      .where("a.employeeId = :employeeId", { employeeId })
      .andWhere("a.effectiveFrom <= :date", { date })
      .andWhere("(a.effectiveTo IS NULL OR a.effectiveTo >= :date)", { date })
      .orderBy("a.effectiveFrom", "DESC")
      .limit(1)
      .getOne();
  }

  async create(
    data: Partial<PyrlEmployeeAssignmentEntity>,
    manager?: EntityManager,
  ): Promise<PyrlEmployeeAssignmentEntity> {
    const repo = manager?.getRepository(PyrlEmployeeAssignmentEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(
    entity: PyrlEmployeeAssignmentEntity,
    manager?: EntityManager,
  ): Promise<PyrlEmployeeAssignmentEntity> {
    return (manager?.getRepository(PyrlEmployeeAssignmentEntity) ?? this.repo).save(entity);
  }
}
