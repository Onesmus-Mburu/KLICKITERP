import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { RptSavedParamsEntity } from "../domain/rpt-saved-params.entity";

/**
 * Plain repository wrapper for `rpt_saved_params`. Module 18 (Reporting)
 * **foundation pass only** — no application service consumes this yet, see
 * docs/phase-5/PROGRESS.md.
 */
@Injectable()
export class RptSavedParamsRepository {
  constructor(
    @InjectRepository(RptSavedParamsEntity)
    private readonly repo: Repository<RptSavedParamsEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<RptSavedParamsEntity | null> {
    return (manager?.getRepository(RptSavedParamsEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<RptSavedParamsEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("RptSavedParams", id);
    return row;
  }

  async listByUser(userId: string, manager?: EntityManager): Promise<RptSavedParamsEntity[]> {
    return (manager?.getRepository(RptSavedParamsEntity) ?? this.repo).find({
      where: { userId },
      order: { reportCode: "ASC", name: "ASC" },
    });
  }

  async create(data: Partial<RptSavedParamsEntity>, manager?: EntityManager): Promise<RptSavedParamsEntity> {
    const repo = manager?.getRepository(RptSavedParamsEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: RptSavedParamsEntity, manager?: EntityManager): Promise<RptSavedParamsEntity> {
    return (manager?.getRepository(RptSavedParamsEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(RptSavedParamsEntity) ?? this.repo).delete({ id });
  }
}
