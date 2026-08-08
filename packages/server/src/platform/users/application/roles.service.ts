import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { SodCheckService } from "../../../shared/rbac/sod-check.service";
import { UsrRoleEntity } from "../domain/usr-role.entity";
import { UsrPermissionEntity } from "../domain/usr-permission.entity";
import { UsrRoleRepository } from "../infrastructure/usr-role.repository";
import { UsrPermissionRepository } from "../infrastructure/usr-permission.repository";
import { UsrRolePermissionRepository } from "../infrastructure/usr-role-permission.repository";
import { UsrUserRoleRepository } from "../infrastructure/usr-user-role.repository";
import { UsrSodRuleRepository } from "../infrastructure/usr-sod-rule.repository";
import { UsrUserRepository } from "../infrastructure/usr-user.repository";

@Injectable()
export class RolesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly roleRepository: UsrRoleRepository,
    private readonly permissionRepository: UsrPermissionRepository,
    private readonly rolePermissionRepository: UsrRolePermissionRepository,
    private readonly userRoleRepository: UsrUserRoleRepository,
    private readonly sodRuleRepository: UsrSodRuleRepository,
    private readonly userRepository: UsrUserRepository,
    private readonly sodCheck: SodCheckService,
  ) {}

  async create(data: { name: string; description?: string; isAuditorClass?: boolean }): Promise<UsrRoleEntity> {
    const existing = await this.roleRepository.findByName(data.name);
    if (existing) {
      throw new ConflictException(`Role name already in use: ${data.name}`);
    }
    return this.roleRepository.create({
      name: data.name,
      description: data.description ?? null,
      isAuditorClass: data.isAuditorClass ?? false,
    });
  }

  async list(): Promise<UsrRoleEntity[]> {
    return this.roleRepository.list();
  }

  async findByIdOrFail(id: string): Promise<UsrRoleEntity> {
    const role = await this.roleRepository.findById(id);
    if (!role) throw new NotFoundException("Role", id);
    return role;
  }

  async update(id: string, changes: { name?: string; description?: string }): Promise<UsrRoleEntity> {
    const role = await this.findByIdOrFail(id);
    if (changes.name !== undefined) role.name = changes.name;
    if (changes.description !== undefined) role.description = changes.description;
    return this.roleRepository.save(role);
  }

  /**
   * Grants a permission to a role, enforcing (defense-in-depth alongside the
   * `trg_auditor_no_write` DB trigger and `SodCheckService`, per G-04's
   * three-layer validation rule):
   *  (a) BR-SEC-04 — an `is_auditor_class` role may never hold an
   *      `is_write=true` permission.
   *  (b) FR-USER-009.1 — the resulting permission set may not contain both
   *      halves of an enabled SoD pair.
   */
  async grantPermission(roleId: string, permissionCode: string): Promise<void> {
    const role = await this.findByIdOrFail(roleId);
    const permission = await this.permissionRepository.findByCode(permissionCode);
    if (!permission) {
      throw new NotFoundException("Permission", permissionCode);
    }
    if (role.isAuditorClass && permission.isWrite) {
      throw new ValidationException(
        `BR-SEC-04: role "${role.name}" is auditor-class and cannot be granted write permission "${permissionCode}"`,
      );
    }

    const currentGrants = await this.rolePermissionRepository.findForRole(roleId);
    const resultingCodes = [...currentGrants.map((g) => g.permission.code), permissionCode];
    const enabledPairs = await this.sodRuleRepository.listEnabledPairs();
    this.sodCheck.assertNoConflict(resultingCodes, enabledPairs);

    if (await this.rolePermissionRepository.exists(roleId, permission.id)) {
      return; // idempotent
    }

    await runInTransaction(this.dataSource, async (manager) => {
      await this.rolePermissionRepository.grant(roleId, permission.id, manager);
    });
  }

  async revokePermission(roleId: string, permissionCode: string): Promise<void> {
    const permission = await this.permissionRepository.findByCode(permissionCode);
    if (!permission) {
      throw new NotFoundException("Permission", permissionCode);
    }
    await runInTransaction(this.dataSource, async (manager) => {
      await this.rolePermissionRepository.revoke(roleId, permission.id, manager);
    });
  }

  /** FR-USER-009.1 — SoD-checked against the union of the user's other roles' permissions. */
  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    await this.userRepository.findByIdOrFail(userId);
    const role = await this.findByIdOrFail(roleId);

    if (await this.userRoleRepository.exists(userId, roleId)) {
      return; // idempotent
    }

    const currentRoleGrants = await this.userRoleRepository.findRolesForUser(userId);
    const currentPermissionCodes = new Set<string>();
    for (const grant of currentRoleGrants) {
      const perms = await this.rolePermissionRepository.findForRole(grant.roleId);
      perms.forEach((p) => currentPermissionCodes.add(p.permission.code));
    }
    const newRolePerms = await this.rolePermissionRepository.findForRole(role.id);
    newRolePerms.forEach((p) => currentPermissionCodes.add(p.permission.code));

    const enabledPairs = await this.sodRuleRepository.listEnabledPairs();
    this.sodCheck.assertNoConflict(Array.from(currentPermissionCodes), enabledPairs);

    await runInTransaction(this.dataSource, async (manager) => {
      await this.userRoleRepository.assign(userId, roleId, manager);
    });
  }

  async unassignRoleFromUser(userId: string, roleId: string): Promise<void> {
    await runInTransaction(this.dataSource, async (manager) => {
      await this.userRoleRepository.unassign(userId, roleId, manager);
    });
  }

  /** Phase 6 Slice 13 Part 1 — thin wrapper over the already relation-populated `findRolesForUser()`, mapping join rows to their `role` entities for `GET /users/:id/roles`. */
  async listRolesForUser(userId: string): Promise<UsrRoleEntity[]> {
    const grants = await this.userRoleRepository.findRolesForUser(userId);
    return grants.map((grant) => grant.role);
  }

  /** Phase 6 Slice 13 Part 1 — thin wrapper over the already relation-populated `findForRole()`, mapping join rows to their `permission` entities for `GET /roles/:id/permissions`. */
  async listPermissionsForRole(roleId: string): Promise<UsrPermissionEntity[]> {
    const grants = await this.rolePermissionRepository.findForRole(roleId);
    return grants.map((grant) => grant.permission);
  }

  /**
   * All user ids currently holding `roleId`, any status (no `ACTIVE` filter
   * — unlike `UsersService.listActiveUsersByRoleId`). First consumer is
   * `tools/bootstrap-admin.ts`'s "refuse to mint a second System Admin
   * unless --force" safety check, which must catch an INVITED/SUSPENDED
   * holder too, not just an ACTIVE one.
   */
  async listUserIdsForRole(roleId: string): Promise<string[]> {
    return this.userRoleRepository.findUserIdsForRole(roleId);
  }
}
