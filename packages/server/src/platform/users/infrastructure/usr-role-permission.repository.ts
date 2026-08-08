import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrRolePermissionEntity } from "../domain/usr-role-permission.entity";

@Injectable()
export class UsrRolePermissionRepository {
  constructor(
    @InjectRepository(UsrRolePermissionEntity)
    private readonly repo: Repository<UsrRolePermissionEntity>,
  ) {}

  async findForRole(roleId: string, manager?: EntityManager): Promise<UsrRolePermissionEntity[]> {
    return (manager?.getRepository(UsrRolePermissionEntity) ?? this.repo).find({
      where: { roleId },
      relations: { permission: true },
    });
  }

  async exists(roleId: string, permissionId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { roleId, permissionId } });
    return count > 0;
  }

  /** Caller (RolesService) must run BR-SEC-04 + SoD checks before calling — this is the raw insert. */
  async grant(roleId: string, permissionId: string, manager: EntityManager): Promise<UsrRolePermissionEntity> {
    const repo = manager.getRepository(UsrRolePermissionEntity);
    return repo.save(repo.create({ roleId, permissionId }));
  }

  async revoke(roleId: string, permissionId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(UsrRolePermissionEntity).delete({ roleId, permissionId });
  }
}
