import { Injectable } from "@nestjs/common";
import { ConflictException } from "../exceptions/conflict.exception";

/** One enabled Segregation-of-Duties pair (BR-SEC-01), expressed as permission codes. */
export interface SodPair {
  permissionACode: string;
  permissionBCode: string;
}

/**
 * Pure BR-SEC-01 evaluator: given the permission-code set a role/user would
 * hold *after* a proposed grant and the currently-enabled SoD pairs, decides
 * whether the grant is legal. Lives in the shared kernel (not a NestJS Guard
 * in `platform/auth`) because:
 *
 *  1. `shared` may import nothing outside itself (module-deps.json) — this
 *     service takes plain data in, so it never needs `UsrSodRuleEntity` or
 *     `UsrPermissionEntity` from `platform/users/domain`. The caller (the
 *     users module's `RolesService`) owns the repository queries and passes
 *     in plain `{permissionACode, permissionBCode}` pairs.
 *  2. The check must run *inside* the same transaction that assigns the
 *     permission (role-permission insert, user-role insert), which an HTTP
 *     guard sitting in front of the controller cannot participate in — a
 *     guard only sees the request DTO, not the resulting permission set.
 *  3. It also needs to be callable from non-HTTP contexts (seed/admin
 *     scripts), so a request-scoped `CanActivate` would be the wrong shape
 *     regardless.
 *
 * This is the module-boundary decision documented in the Module 1 report:
 * SoD enforcement is an injectable service, not `sod.guard.ts`.
 */
@Injectable()
export class SodCheckService {
  /**
   * Throws `ConflictException` naming the first conflicting pair found
   * (FR-USER-009.1 "rejected with the conflicting pair named"). A conflict
   * exists when both permissions of an enabled pair would be held
   * simultaneously by the resulting set.
   */
  assertNoConflict(resultingPermissionCodes: readonly string[], enabledPairs: readonly SodPair[]): void {
    const codes = new Set(resultingPermissionCodes);
    for (const pair of enabledPairs) {
      if (codes.has(pair.permissionACode) && codes.has(pair.permissionBCode)) {
        throw new ConflictException(
          `Segregation-of-duties violation: "${pair.permissionACode}" and "${pair.permissionBCode}" cannot be held together`,
          { permissionACode: pair.permissionACode, permissionBCode: pair.permissionBCode },
        );
      }
    }
  }

  /** Non-throwing variant — returns the first conflicting pair, or null. */
  findConflict(resultingPermissionCodes: readonly string[], enabledPairs: readonly SodPair[]): SodPair | null {
    const codes = new Set(resultingPermissionCodes);
    for (const pair of enabledPairs) {
      if (codes.has(pair.permissionACode) && codes.has(pair.permissionBCode)) {
        return pair;
      }
    }
    return null;
  }
}
