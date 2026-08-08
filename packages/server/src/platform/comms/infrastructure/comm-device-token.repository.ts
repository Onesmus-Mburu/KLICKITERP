import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { CommDeviceTokenEntity } from "../domain/comm-device-token.entity";

@Injectable()
export class CommDeviceTokenRepository {
  constructor(
    @InjectRepository(CommDeviceTokenEntity)
    private readonly repo: Repository<CommDeviceTokenEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<CommDeviceTokenEntity | null> {
    return (manager?.getRepository(CommDeviceTokenEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<CommDeviceTokenEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("CommDeviceToken", id);
    return row;
  }

  /** Backs `DeviceTokensService.register()`'s upsert-by-`token` semantics. */
  async findByToken(token: string, manager?: EntityManager): Promise<CommDeviceTokenEntity | null> {
    return (manager?.getRepository(CommDeviceTokenEntity) ?? this.repo).findOne({ where: { token } });
  }

  async listByUser(userId: string, manager?: EntityManager): Promise<CommDeviceTokenEntity[]> {
    return (manager?.getRepository(CommDeviceTokenEntity) ?? this.repo).find({
      where: { userId },
      order: { lastSeenAt: "DESC" },
    });
  }

  async create(data: Partial<CommDeviceTokenEntity>, manager?: EntityManager): Promise<CommDeviceTokenEntity> {
    const repo = manager?.getRepository(CommDeviceTokenEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: CommDeviceTokenEntity, manager?: EntityManager): Promise<CommDeviceTokenEntity> {
    return (manager?.getRepository(CommDeviceTokenEntity) ?? this.repo).save(entity);
  }

  async deleteByToken(token: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(CommDeviceTokenEntity) ?? this.repo).delete({ token });
  }
}
