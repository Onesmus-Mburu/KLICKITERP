import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrUserEntity, UsrUserType } from "../../users/domain/usr-user.entity";

/**
 * Auth-scoped `usr_user` queries only — authentication mechanics (credential
 * lookup, login/password stamping), never general CRUD (that's
 * `platform/users`'s `UsrUserRepository`). See the Module 1 report's
 * module-boundary decision: two repository classes, one table, split by
 * concern, both wrapping the same `Repository<UsrUserEntity>` via
 * `TypeOrmModule.forFeature` in their own module.
 */
@Injectable()
export class AuthUsrUserRepository {
  constructor(
    @InjectRepository(UsrUserEntity)
    private readonly repo: Repository<UsrUserEntity>,
  ) {}

  /** FR-AUTH-001.1 — login identifier may be username, email, or phone. */
  async findByIdentifier(identifier: string): Promise<UsrUserEntity | null> {
    return this.repo
      .createQueryBuilder("u")
      .where("u.username = :identifier", { identifier })
      .orWhere("u.email = :identifier", { identifier })
      .orWhere("u.phone = :identifier", { identifier })
      .getOne();
  }

  async findByPhoneAndType(phone: string, userType: UsrUserType): Promise<UsrUserEntity | null> {
    return this.repo.findOne({ where: { phone, userType } });
  }

  async findById(id: string, manager?: EntityManager): Promise<UsrUserEntity | null> {
    return (manager?.getRepository(UsrUserEntity) ?? this.repo).findOne({ where: { id } });
  }

  async save(entity: UsrUserEntity, manager?: EntityManager): Promise<UsrUserEntity> {
    return (manager?.getRepository(UsrUserEntity) ?? this.repo).save(entity);
  }

  async touchLastLogin(userId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(UsrUserEntity).update({ id: userId }, { lastLoginAt: new Date() });
  }
}
