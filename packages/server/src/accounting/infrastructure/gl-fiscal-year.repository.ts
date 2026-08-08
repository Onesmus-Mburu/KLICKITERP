import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { GlFiscalYearEntity } from "../domain/gl-fiscal-year.entity";

@Injectable()
export class GlFiscalYearRepository {
  constructor(
    @InjectRepository(GlFiscalYearEntity)
    private readonly repo: Repository<GlFiscalYearEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<GlFiscalYearEntity | null> {
    return (manager?.getRepository(GlFiscalYearEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<GlFiscalYearEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("GlFiscalYear", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<GlFiscalYearEntity | null> {
    return (manager?.getRepository(GlFiscalYearEntity) ?? this.repo).findOne({ where: { name } });
  }

  /** The year(s) not yet locked — a future period-close workflow's candidate set. */
  async listOpenOrClosing(manager?: EntityManager): Promise<GlFiscalYearEntity[]> {
    return (manager?.getRepository(GlFiscalYearEntity) ?? this.repo)
      .createQueryBuilder("fy")
      .where("fy.status IN (:...statuses)", { statuses: ["OPEN", "CLOSING"] })
      .orderBy("fy.starts_on", "ASC")
      .getMany();
  }

  async list(manager?: EntityManager): Promise<GlFiscalYearEntity[]> {
    return (manager?.getRepository(GlFiscalYearEntity) ?? this.repo).find({ order: { startsOn: "ASC" } });
  }

  async create(data: Partial<GlFiscalYearEntity>, manager: EntityManager): Promise<GlFiscalYearEntity> {
    const repo = manager.getRepository(GlFiscalYearEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: GlFiscalYearEntity, manager?: EntityManager): Promise<GlFiscalYearEntity> {
    return (manager?.getRepository(GlFiscalYearEntity) ?? this.repo).save(entity);
  }
}
