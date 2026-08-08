import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlStructureComponentEntity } from "../domain/pyrl-structure-component.entity";

/** Plain repository wrapper for `pyrl_structure_component`, plus `findByStructureId()`. */
@Injectable()
export class PyrlStructureComponentRepository {
  constructor(
    @InjectRepository(PyrlStructureComponentEntity)
    private readonly repo: Repository<PyrlStructureComponentEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlStructureComponentEntity | null> {
    return (manager?.getRepository(PyrlStructureComponentEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlStructureComponentEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlStructureComponent", id);
    return row;
  }

  /** All component lines of a salary structure — structure-editing/computation-engine entry point. */
  async findByStructureId(
    structureId: string,
    manager?: EntityManager,
  ): Promise<PyrlStructureComponentEntity[]> {
    return (manager?.getRepository(PyrlStructureComponentEntity) ?? this.repo).find({
      where: { structureId },
    });
  }

  async create(
    data: Partial<PyrlStructureComponentEntity>,
    manager?: EntityManager,
  ): Promise<PyrlStructureComponentEntity> {
    const repo = manager?.getRepository(PyrlStructureComponentEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(
    entity: PyrlStructureComponentEntity,
    manager?: EntityManager,
  ): Promise<PyrlStructureComponentEntity> {
    return (manager?.getRepository(PyrlStructureComponentEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(PyrlStructureComponentEntity) ?? this.repo).delete({ id });
  }
}
