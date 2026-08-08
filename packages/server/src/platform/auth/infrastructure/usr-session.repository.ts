import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrSessionEntity } from "../../users/domain/usr-session.entity";

@Injectable()
export class UsrSessionRepository {
  constructor(
    @InjectRepository(UsrSessionEntity)
    private readonly repo: Repository<UsrSessionEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<UsrSessionEntity | null> {
    return (manager?.getRepository(UsrSessionEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByRefreshTokenHash(hash: string, manager?: EntityManager): Promise<UsrSessionEntity | null> {
    return (manager?.getRepository(UsrSessionEntity) ?? this.repo).findOne({ where: { refreshTokenHash: hash } });
  }

  async findFamily(familyId: string, manager: EntityManager): Promise<UsrSessionEntity[]> {
    return manager.getRepository(UsrSessionEntity).find({ where: { familyId } });
  }

  async create(data: Partial<UsrSessionEntity>, manager: EntityManager): Promise<UsrSessionEntity> {
    const repo = manager.getRepository(UsrSessionEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: UsrSessionEntity, manager?: EntityManager): Promise<UsrSessionEntity> {
    return (manager?.getRepository(UsrSessionEntity) ?? this.repo).save(entity);
  }

  async revoke(id: string, reason: string, manager: EntityManager): Promise<void> {
    await manager
      .getRepository(UsrSessionEntity)
      .update({ id }, { revokedAt: new Date(), revokeReason: reason });
  }

  /** FR-AUTH-002.1 — reuse of a rotated refresh token revokes the whole session family. */
  async revokeFamily(familyId: string, reason: string, manager: EntityManager): Promise<void> {
    await manager
      .getRepository(UsrSessionEntity)
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date(), revokeReason: reason })
      .where("family_id = :familyId", { familyId })
      .andWhere("revoked_at IS NULL")
      .execute();
  }

  /** Password reset — "invalidates all sessions for that user" (§2.7). */
  async revokeAllForUser(userId: string, reason: string, manager: EntityManager): Promise<void> {
    await manager
      .getRepository(UsrSessionEntity)
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date(), revokeReason: reason })
      .where("user_id = :userId", { userId })
      .andWhere("revoked_at IS NULL")
      .execute();
  }
}
