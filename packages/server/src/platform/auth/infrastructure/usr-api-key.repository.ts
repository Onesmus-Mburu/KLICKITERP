import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UsrApiKeyEntity } from "../../users/domain/usr-api-key.entity";

@Injectable()
export class UsrApiKeyRepository {
  constructor(
    @InjectRepository(UsrApiKeyEntity)
    private readonly repo: Repository<UsrApiKeyEntity>,
  ) {}

  async findByHash(keyHash: string): Promise<UsrApiKeyEntity | null> {
    return this.repo.findOne({ where: { keyHash } });
  }

  async findById(id: string): Promise<UsrApiKeyEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async listForOwner(ownerUserId: string): Promise<UsrApiKeyEntity[]> {
    return this.repo.find({ where: { ownerUserId }, order: { createdAt: "DESC" } });
  }

  async create(data: Partial<UsrApiKeyEntity>): Promise<UsrApiKeyEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async save(entity: UsrApiKeyEntity): Promise<UsrApiKeyEntity> {
    return this.repo.save(entity);
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.repo.update({ id }, { lastUsedAt: new Date() });
  }
}
