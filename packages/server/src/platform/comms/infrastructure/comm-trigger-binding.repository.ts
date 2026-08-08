import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { CommChannel } from "../domain/comm-template.entity";
import { CommTriggerBindingEntity } from "../domain/comm-trigger-binding.entity";

@Injectable()
export class CommTriggerBindingRepository {
  constructor(
    @InjectRepository(CommTriggerBindingEntity)
    private readonly repo: Repository<CommTriggerBindingEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<CommTriggerBindingEntity | null> {
    return (manager?.getRepository(CommTriggerBindingEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<CommTriggerBindingEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("CommTriggerBinding", id);
    return row;
  }

  async findByEventAndChannel(
    eventCode: string,
    channel: CommChannel,
    manager?: EntityManager,
  ): Promise<CommTriggerBindingEntity | null> {
    return (manager?.getRepository(CommTriggerBindingEntity) ?? this.repo).findOne({
      where: { eventCode, channel },
    });
  }

  async list(manager?: EntityManager): Promise<CommTriggerBindingEntity[]> {
    return (manager?.getRepository(CommTriggerBindingEntity) ?? this.repo).find({ order: { createdAt: "DESC" } });
  }

  async create(data: Partial<CommTriggerBindingEntity>, manager?: EntityManager): Promise<CommTriggerBindingEntity> {
    const repo = manager?.getRepository(CommTriggerBindingEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: CommTriggerBindingEntity, manager?: EntityManager): Promise<CommTriggerBindingEntity> {
    return (manager?.getRepository(CommTriggerBindingEntity) ?? this.repo).save(entity);
  }
}
