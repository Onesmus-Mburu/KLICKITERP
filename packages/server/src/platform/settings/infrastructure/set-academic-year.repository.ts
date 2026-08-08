import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { SetAcademicYearEntity } from "../domain/set-academic-year.entity";

@Injectable()
export class SetAcademicYearRepository {
  constructor(
    @InjectRepository(SetAcademicYearEntity)
    private readonly repo: Repository<SetAcademicYearEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<SetAcademicYearEntity | null> {
    return (manager?.getRepository(SetAcademicYearEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<SetAcademicYearEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("AcademicYear", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<SetAcademicYearEntity | null> {
    return (manager?.getRepository(SetAcademicYearEntity) ?? this.repo).findOne({ where: { name } });
  }

  async findCurrent(manager?: EntityManager): Promise<SetAcademicYearEntity | null> {
    return (manager?.getRepository(SetAcademicYearEntity) ?? this.repo).findOne({ where: { isCurrent: true } });
  }

  async list(manager?: EntityManager): Promise<SetAcademicYearEntity[]> {
    return (manager?.getRepository(SetAcademicYearEntity) ?? this.repo).find({ order: { startsOn: "DESC" } });
  }

  async create(data: Partial<SetAcademicYearEntity>, manager?: EntityManager): Promise<SetAcademicYearEntity> {
    const repo = manager?.getRepository(SetAcademicYearEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: SetAcademicYearEntity, manager?: EntityManager): Promise<SetAcademicYearEntity> {
    return (manager?.getRepository(SetAcademicYearEntity) ?? this.repo).save(entity);
  }
}
