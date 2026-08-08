import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlEmployeeComponentEntity } from "../domain/pyrl-employee-component.entity";

/**
 * Plain repository wrapper for `pyrl_employee_component`, plus
 * `findActiveFor()` — all of an employee's component overrides active on a
 * given date (unlike `pyrl_employee_assignment`, more than one row can be
 * active simultaneously, one per distinct `component_id` — see the
 * entity's own doc comment on the EXCLUDE constraint's scoping).
 */
@Injectable()
export class PyrlEmployeeComponentRepository {
  constructor(
    @InjectRepository(PyrlEmployeeComponentEntity)
    private readonly repo: Repository<PyrlEmployeeComponentEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlEmployeeComponentEntity | null> {
    return (manager?.getRepository(PyrlEmployeeComponentEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlEmployeeComponentEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlEmployeeComponent", id);
    return row;
  }

  async findByEmployeeId(
    employeeId: string,
    manager?: EntityManager,
  ): Promise<PyrlEmployeeComponentEntity[]> {
    return (manager?.getRepository(PyrlEmployeeComponentEntity) ?? this.repo).find({
      where: { employeeId },
      order: { effectiveFrom: "DESC" },
    });
  }

  /** All of an employee's component overrides covering `date` — one per distinct `component_id` at most. */
  async findActiveFor(
    employeeId: string,
    date: string,
    manager?: EntityManager,
  ): Promise<PyrlEmployeeComponentEntity[]> {
    return (manager?.getRepository(PyrlEmployeeComponentEntity) ?? this.repo)
      .createQueryBuilder("c")
      .where("c.employeeId = :employeeId", { employeeId })
      .andWhere("c.effectiveFrom <= :date", { date })
      .andWhere("(c.effectiveTo IS NULL OR c.effectiveTo >= :date)", { date })
      .orderBy("c.effectiveFrom", "DESC")
      .getMany();
  }

  async create(
    data: Partial<PyrlEmployeeComponentEntity>,
    manager?: EntityManager,
  ): Promise<PyrlEmployeeComponentEntity> {
    const repo = manager?.getRepository(PyrlEmployeeComponentEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(
    entity: PyrlEmployeeComponentEntity,
    manager?: EntityManager,
  ): Promise<PyrlEmployeeComponentEntity> {
    return (manager?.getRepository(PyrlEmployeeComponentEntity) ?? this.repo).save(entity);
  }
}
