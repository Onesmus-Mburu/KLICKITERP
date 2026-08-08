import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BkpRestoreRunEntity } from "../domain/bkp-restore-run.entity";

@Injectable()
export class BkpRestoreRunRepository {
  constructor(
    @InjectRepository(BkpRestoreRunEntity)
    private readonly repo: Repository<BkpRestoreRunEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BkpRestoreRunEntity | null> {
    return (manager?.getRepository(BkpRestoreRunEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BkpRestoreRunEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BkpRestoreRun", id);
    return row;
  }

  async list(limit = 50, offset = 0, manager?: EntityManager): Promise<[BkpRestoreRunEntity[], number]> {
    const repo = manager?.getRepository(BkpRestoreRunEntity) ?? this.repo;
    return repo.findAndCount({ order: { startedAt: "DESC" }, take: limit, skip: offset });
  }

  async create(data: Partial<BkpRestoreRunEntity>, manager?: EntityManager): Promise<BkpRestoreRunEntity> {
    const repo = manager?.getRepository(BkpRestoreRunEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BkpRestoreRunEntity, manager?: EntityManager): Promise<BkpRestoreRunEntity> {
    return (manager?.getRepository(BkpRestoreRunEntity) ?? this.repo).save(entity);
  }
}
