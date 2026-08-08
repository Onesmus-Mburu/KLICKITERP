import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlSalaryStructureEntity } from "../domain/pyrl-salary-structure.entity";

/** Plain repository wrapper for `pyrl_salary_structure`. */
@Injectable()
export class PyrlSalaryStructureRepository {
  constructor(
    @InjectRepository(PyrlSalaryStructureEntity)
    private readonly repo: Repository<PyrlSalaryStructureEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlSalaryStructureEntity | null> {
    return (manager?.getRepository(PyrlSalaryStructureEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlSalaryStructureEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlSalaryStructure", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<PyrlSalaryStructureEntity | null> {
    return (manager?.getRepository(PyrlSalaryStructureEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<PyrlSalaryStructureEntity[]> {
    return (manager?.getRepository(PyrlSalaryStructureEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(
    data: Partial<PyrlSalaryStructureEntity>,
    manager?: EntityManager,
  ): Promise<PyrlSalaryStructureEntity> {
    const repo = manager?.getRepository(PyrlSalaryStructureEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlSalaryStructureEntity, manager?: EntityManager): Promise<PyrlSalaryStructureEntity> {
    return (manager?.getRepository(PyrlSalaryStructureEntity) ?? this.repo).save(entity);
  }
}
