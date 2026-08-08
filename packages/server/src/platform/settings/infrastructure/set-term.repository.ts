import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { SetTermEntity } from "../domain/set-term.entity";

@Injectable()
export class SetTermRepository {
  constructor(
    @InjectRepository(SetTermEntity)
    private readonly repo: Repository<SetTermEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<SetTermEntity | null> {
    return (manager?.getRepository(SetTermEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<SetTermEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("Term", id);
    return row;
  }

  async findByYearAndSeq(
    academicYearId: string,
    seq: number,
    manager?: EntityManager,
  ): Promise<SetTermEntity | null> {
    return (manager?.getRepository(SetTermEntity) ?? this.repo).findOne({ where: { academicYearId, seq } });
  }

  async findCurrent(manager?: EntityManager): Promise<SetTermEntity | null> {
    return (manager?.getRepository(SetTermEntity) ?? this.repo).findOne({ where: { isCurrent: true } });
  }

  async list(academicYearId?: string, manager?: EntityManager): Promise<SetTermEntity[]> {
    return (manager?.getRepository(SetTermEntity) ?? this.repo).find({
      where: academicYearId ? { academicYearId } : {},
      order: { seq: "ASC" },
    });
  }

  async create(data: Partial<SetTermEntity>, manager?: EntityManager): Promise<SetTermEntity> {
    const repo = manager?.getRepository(SetTermEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: SetTermEntity, manager?: EntityManager): Promise<SetTermEntity> {
    return (manager?.getRepository(SetTermEntity) ?? this.repo).save(entity);
  }
}
