import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { DataSource } from "typeorm";

export interface EffectivePermissions {
  roleNames: string[];
  permissionCodes: string[];
  permsHash: string;
}

/**
 * Resolves a user's effective (role -> role_permission -> permission) set at
 * login/refresh time, for the JWT `perms_hash` claim and the Redis
 * permission-set cache `PermissionsGuard` reads (docs/phase-3/02-communication-authentication.md
 * §2.3). Reads `usr_user_role`/`usr_role`/`usr_role_permission`/`usr_permission`
 * directly — these are `platform/users`'s domain entities, imported under
 * the Module 1 auth->users boundary decision (module-deps.json), not
 * `UsersService` — keeping auth's coupling to users at the schema level only.
 */
@Injectable()
export class PermissionResolutionRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async resolveForUser(userId: string): Promise<EffectivePermissions> {
    const rows: Array<{ role_name: string; permission_code: string | null }> = await this.dataSource.query(
      `
      SELECT r.name AS role_name, p.code AS permission_code
      FROM app.usr_user_role ur
      JOIN app.usr_role r ON r.id = ur.role_id
      LEFT JOIN app.usr_role_permission rp ON rp.role_id = r.id
      LEFT JOIN app.usr_permission p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
      `,
      [userId],
    );

    const roleNames = Array.from(new Set(rows.map((r) => r.role_name))).sort();
    const permissionCodes = Array.from(
      new Set(rows.map((r) => r.permission_code).filter((c): c is string => c !== null)),
    ).sort();

    return { roleNames, permissionCodes, permsHash: hashPermissionSet(permissionCodes) };
  }

  /** Exposed for repositories/services that only need the join rows (e.g. tests). */
  async findUserRoleIds(userId: string): Promise<string[]> {
    const rows: Array<{ role_id: string }> = await this.dataSource.query(
      `SELECT role_id FROM app.usr_user_role WHERE user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.role_id);
  }
}

export function hashPermissionSet(sortedPermissionCodes: readonly string[]): string {
  return createHash("sha256").update(sortedPermissionCodes.join(",")).digest("hex").slice(0, 32);
}
