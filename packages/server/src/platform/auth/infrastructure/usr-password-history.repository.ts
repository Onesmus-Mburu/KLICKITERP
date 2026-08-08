import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrPasswordHistoryEntity } from "../../users/domain/usr-password-history.entity";

const REUSE_CHECK_DEPTH = 5;

@Injectable()
export class UsrPasswordHistoryRepository {
  constructor(
    @InjectRepository(UsrPasswordHistoryEntity)
    private readonly repo: Repository<UsrPasswordHistoryEntity>,
  ) {}

  /** Last N hashes (newest first) — reject reuse of the last 5 (password.service.ts). */
  async findRecent(userId: string, limit: number = REUSE_CHECK_DEPTH): Promise<UsrPasswordHistoryEntity[]> {
    return this.repo.find({ where: { userId }, order: { at: "DESC" }, take: limit });
  }

  async record(userId: string, passwordHash: string, manager: EntityManager): Promise<UsrPasswordHistoryEntity> {
    const repo = manager.getRepository(UsrPasswordHistoryEntity);
    return repo.save(repo.create({ userId, passwordHash }));
  }
}
