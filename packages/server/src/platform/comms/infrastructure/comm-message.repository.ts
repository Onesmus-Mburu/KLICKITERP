import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { CommMessageEntity, CommMessageStatus } from "../domain/comm-message.entity";

export interface ListMessagesOptions {
  status?: CommMessageStatus;
  entityType?: string;
  entityId?: string;
  broadcastId?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class CommMessageRepository {
  constructor(
    @InjectRepository(CommMessageEntity)
    private readonly repo: Repository<CommMessageEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<CommMessageEntity | null> {
    return (manager?.getRepository(CommMessageEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<CommMessageEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("CommMessage", id);
    return row;
  }

  async create(data: Partial<CommMessageEntity>, manager?: EntityManager): Promise<CommMessageEntity> {
    const repo = manager?.getRepository(CommMessageEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: CommMessageEntity, manager?: EntityManager): Promise<CommMessageEntity> {
    return (manager?.getRepository(CommMessageEntity) ?? this.repo).save(entity);
  }

  /** READ-ONLY filter surface backing `messages.controller.ts` — no mutation endpoint exists (see that controller's doc comment). */
  async list(options: ListMessagesOptions = {}, manager?: EntityManager): Promise<[CommMessageEntity[], number]> {
    const qb = (manager?.getRepository(CommMessageEntity) ?? this.repo).createQueryBuilder("m");
    if (options.status) qb.andWhere("m.status = :status", { status: options.status });
    if (options.entityType) qb.andWhere("m.entityType = :entityType", { entityType: options.entityType });
    if (options.entityId) qb.andWhere("m.entityId = :entityId", { entityId: options.entityId });
    if (options.broadcastId) qb.andWhere("m.broadcastId = :broadcastId", { broadcastId: options.broadcastId });
    qb.orderBy("m.queuedAt", "DESC");
    if (options.skip !== undefined) qb.skip(options.skip);
    if (options.take !== undefined) qb.take(options.take);
    return qb.getManyAndCount();
  }
}
