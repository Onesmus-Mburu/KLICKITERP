import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SodCheckService } from "../../shared/rbac/sod-check.service";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { UsrUserEntity } from "./domain/usr-user.entity";
import { UsrRoleEntity } from "./domain/usr-role.entity";
import { UsrPermissionEntity } from "./domain/usr-permission.entity";
import { UsrUserRoleEntity } from "./domain/usr-user-role.entity";
import { UsrRolePermissionEntity } from "./domain/usr-role-permission.entity";
import { UsrDepartmentEntity } from "./domain/usr-department.entity";
import { UsrSodRuleEntity } from "./domain/usr-sod-rule.entity";
import { UsrUserRepository } from "./infrastructure/usr-user.repository";
import { UsrRoleRepository } from "./infrastructure/usr-role.repository";
import { UsrPermissionRepository } from "./infrastructure/usr-permission.repository";
import { UsrUserRoleRepository } from "./infrastructure/usr-user-role.repository";
import { UsrRolePermissionRepository } from "./infrastructure/usr-role-permission.repository";
import { UsrDepartmentRepository } from "./infrastructure/usr-department.repository";
import { UsrSodRuleRepository } from "./infrastructure/usr-sod-rule.repository";
import { UsersService } from "./application/users.service";
import { RolesService } from "./application/roles.service";
import { DepartmentsService } from "./application/departments.service";
import { PermissionsService } from "./application/permissions.service";
import { UsersController } from "./api/users.controller";
import { RolesController } from "./api/roles.controller";
import { DepartmentsController } from "./api/departments.controller";
import { PermissionsController } from "./api/permissions.controller";
import "./domain/permission-catalogue"; // side-effect: registers Module 1's permission catalogue

/**
 * Exports ONLY `UsersService`/`RolesService`/`DepartmentsService`/
 * `PermissionsService` (the module's public surface) per the module anatomy
 * rule (architecture doc §4.2) — repositories never leave their module.
 * `PermissionsService` added Phase 6 Slice 13 Part 1, exported for symmetry
 * with the other three even though it has no consumer outside this module
 * yet. `platform/users` itself imports shared-kernel only (module-deps.json);
 * `platform/auth` is the one permitted one-directional consumer, and by
 * convention reaches only this module's domain entities, never these
 * services' internals.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsrUserEntity,
      UsrRoleEntity,
      UsrPermissionEntity,
      UsrUserRoleEntity,
      UsrRolePermissionEntity,
      UsrDepartmentEntity,
      UsrSodRuleEntity,
    ]),
  ],
  controllers: [UsersController, RolesController, DepartmentsController, PermissionsController],
  providers: [
    UsrUserRepository,
    UsrRoleRepository,
    UsrPermissionRepository,
    UsrUserRoleRepository,
    UsrRolePermissionRepository,
    UsrDepartmentRepository,
    UsrSodRuleRepository,
    UsersService,
    RolesService,
    DepartmentsService,
    PermissionsService,
    SodCheckService,
    OutboxWriterService,
  ],
  exports: [UsersService, RolesService, DepartmentsService, PermissionsService],
})
export class UsersModule {}
