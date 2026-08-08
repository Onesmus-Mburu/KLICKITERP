import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrUserRoleEntity } from "../domain/usr-user-role.entity";

@Injectable()
export class UsrUserRoleRepository {
  constructor(
    @InjectRepository(UsrUserRoleEntity)
    private readonly repo: Repository<UsrUserRoleEntity>,
  ) {}

  async findRolesForUser(userId: string, manager?: EntityManager): Promise<UsrUserRoleEntity[]> {
    return (manager?.getRepository(UsrUserRoleEntity) ?? this.repo).find({
      where: { userId },
      relations: { role: true },
    });
  }

  async exists(userId: string, roleId: string, manager?: EntityManager): Promise<boolean> {
    const count = await (manager?.getRepository(UsrUserRoleEntity) ?? this.repo).count({
      where: { userId, roleId },
    });
    return count > 0;
  }

  /** All user ids currently granted `roleId` — first consumer is `comms` module's `STAFF_ROLE` broadcast audience resolution. */
  async findUserIdsForRole(roleId: string, manager?: EntityManager): Promise<string[]> {
    const rows = await (manager?.getRepository(UsrUserRoleEntity) ?? this.repo).find({ where: { roleId } });
    return rows.map((row) => row.userId);
  }

  async assign(userId: string, roleId: string, manager: EntityManager): Promise<UsrUserRoleEntity> {
    const repo = manager.getRepository(UsrUserRoleEntity);
    return repo.save(repo.create({ userId, roleId }));
  }

  async unassign(userId: string, roleId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(UsrUserRoleEntity).delete({ userId, roleId });
  }
}
