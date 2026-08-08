import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlComponentEntity, PyrlComponentKind } from "../domain/pyrl-component.entity";

export interface ListPyrlComponentsFilter {
  kind?: PyrlComponentKind;
  isStatutory?: boolean;
}

/** Plain repository wrapper for `pyrl_component`. */
@Injectable()
export class PyrlComponentRepository {
  constructor(
    @InjectRepository(PyrlComponentEntity)
    private readonly repo: Repository<PyrlComponentEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlComponentEntity | null> {
    return (manager?.getRepository(PyrlComponentEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlComponentEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlComponent", id);
    return row;
  }

  async findByCode(code: string, manager?: EntityManager): Promise<PyrlComponentEntity | null> {
    return (manager?.getRepository(PyrlComponentEntity) ?? this.repo).findOne({ where: { code } });
  }

  async list(filter: ListPyrlComponentsFilter = {}, manager?: EntityManager): Promise<PyrlComponentEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.kind !== undefined) where.kind = filter.kind;
    if (filter.isStatutory !== undefined) where.isStatutory = filter.isStatutory;
    return (manager?.getRepository(PyrlComponentEntity) ?? this.repo).find({ where, order: { name: "ASC" } });
  }

  async create(data: Partial<PyrlComponentEntity>, manager?: EntityManager): Promise<PyrlComponentEntity> {
    const repo = manager?.getRepository(PyrlComponentEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlComponentEntity, manager?: EntityManager): Promise<PyrlComponentEntity> {
    return (manager?.getRepository(PyrlComponentEntity) ?? this.repo).save(entity);
  }
}
