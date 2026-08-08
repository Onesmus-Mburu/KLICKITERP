import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { CommBroadcastEntity } from "../domain/comm-broadcast.entity";

@Injectable()
export class CommBroadcastRepository {
  constructor(
    @InjectRepository(CommBroadcastEntity)
    private readonly repo: Repository<CommBroadcastEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<CommBroadcastEntity | null> {
    return (manager?.getRepository(CommBroadcastEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<CommBroadcastEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("CommBroadcast", id);
    return row;
  }

  async list(manager?: EntityManager): Promise<CommBroadcastEntity[]> {
    return (manager?.getRepository(CommBroadcastEntity) ?? this.repo).find({ order: { createdAt: "DESC" } });
  }

  async create(data: Partial<CommBroadcastEntity>, manager?: EntityManager): Promise<CommBroadcastEntity> {
    const repo = manager?.getRepository(CommBroadcastEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: CommBroadcastEntity, manager?: EntityManager): Promise<CommBroadcastEntity> {
    return (manager?.getRepository(CommBroadcastEntity) ?? this.repo).save(entity);
  }
}
