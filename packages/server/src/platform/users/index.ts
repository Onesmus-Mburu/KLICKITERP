/**
 * Public barrel — the only surface `platform/auth` (or any future sibling
 * module) should import from. Re-exports the module class, its public
 * services, and the domain entities that double as this module's schema
 * contract (auth's own repositories query the same tables via these types).
 */
export { UsersModule } from "./users.module";
export { UsersService } from "./application/users.service";
export { RolesService } from "./application/roles.service";
export { DepartmentsService } from "./application/departments.service";
export { PermissionsService } from "./application/permissions.service";
export { PERMISSION_CATALOGUE } from "./domain/permission-catalogue";
export type { PermissionCatalogueEntry } from "./application/permission-registry";

export { UsrUserEntity } from "./domain/usr-user.entity";
export type { UsrUserStatus, UsrUserType } from "./domain/usr-user.entity";
export { UsrRoleEntity } from "./domain/usr-role.entity";
export { UsrPermissionEntity } from "./domain/usr-permission.entity";
export { UsrUserRoleEntity } from "./domain/usr-user-role.entity";
export { UsrRolePermissionEntity } from "./domain/usr-role-permission.entity";
export { UsrDepartmentEntity } from "./domain/usr-department.entity";
export { UsrSodRuleEntity } from "./domain/usr-sod-rule.entity";
