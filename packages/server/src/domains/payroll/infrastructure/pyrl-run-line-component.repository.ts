import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlRunLineComponentEntity } from "../domain/pyrl-run-line-component.entity";

/** Plain repository wrapper for `pyrl_run_line_component`, plus `findByRunLineId()`. */
@Injectable()
export class PyrlRunLineComponentRepository {
  constructor(
    @InjectRepository(PyrlRunLineComponentEntity)
    private readonly repo: Repository<PyrlRunLineComponentEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlRunLineComponentEntity | null> {
    return (manager?.getRepository(PyrlRunLineComponentEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlRunLineComponentEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlRunLineComponent", id);
    return row;
  }

  /** The full earning/deduction breakdown backing a `pyrl_run_line`'s aggregate totals — payslip detail entry point. */
  async findByRunLineId(
    runLineId: string,
    manager?: EntityManager,
  ): Promise<PyrlRunLineComponentEntity[]> {
    return (manager?.getRepository(PyrlRunLineComponentEntity) ?? this.repo).find({ where: { runLineId } });
  }

  async create(
    data: Partial<PyrlRunLineComponentEntity>,
    manager?: EntityManager,
  ): Promise<PyrlRunLineComponentEntity> {
    const repo = manager?.getRepository(PyrlRunLineComponentEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(
    entity: PyrlRunLineComponentEntity,
    manager?: EntityManager,
  ): Promise<PyrlRunLineComponentEntity> {
    return (manager?.getRepository(PyrlRunLineComponentEntity) ?? this.repo).save(entity);
  }
}
