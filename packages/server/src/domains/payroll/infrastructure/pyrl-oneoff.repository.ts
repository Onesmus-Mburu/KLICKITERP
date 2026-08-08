import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlOneoffEntity } from "../domain/pyrl-oneoff.entity";

/** Plain repository wrapper for `pyrl_oneoff`, plus `findByEmployeeAndPeriod()`. */
@Injectable()
export class PyrlOneoffRepository {
  constructor(
    @InjectRepository(PyrlOneoffEntity)
    private readonly repo: Repository<PyrlOneoffEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlOneoffEntity | null> {
    return (manager?.getRepository(PyrlOneoffEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlOneoffEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlOneoff", id);
    return row;
  }

  /** All one-off earnings/deductions queued for an employee in a period — the computation engine's consumption entry point. */
  async findByEmployeeAndPeriod(
    employeeId: string,
    periodKey: string,
    manager?: EntityManager,
  ): Promise<PyrlOneoffEntity[]> {
    return (manager?.getRepository(PyrlOneoffEntity) ?? this.repo).find({ where: { employeeId, periodKey } });
  }

  async listByPeriod(periodKey: string, manager?: EntityManager): Promise<PyrlOneoffEntity[]> {
    return (manager?.getRepository(PyrlOneoffEntity) ?? this.repo).find({ where: { periodKey } });
  }

  async create(data: Partial<PyrlOneoffEntity>, manager?: EntityManager): Promise<PyrlOneoffEntity> {
    const repo = manager?.getRepository(PyrlOneoffEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlOneoffEntity, manager?: EntityManager): Promise<PyrlOneoffEntity> {
    return (manager?.getRepository(PyrlOneoffEntity) ?? this.repo).save(entity);
  }

  /** PASS B — removes a not-yet-consumed one-off row (see `OneoffsService`'s own doc comment). */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(PyrlOneoffEntity) ?? this.repo).delete({ id });
  }
}
