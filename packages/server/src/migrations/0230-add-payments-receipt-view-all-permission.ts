import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";
import { PERMISSION_CATALOGUE } from "../platform/users/domain/permission-catalogue";

const PERMISSION_CODE = "payments:receipt:view-all";
// `0900-seed-permissions-and-roles.ts`'s own `SYSTEM_ADMIN_ROLE`/`AUDITOR_ROLE`
// consts are local (not exported) — reaching into an already-applied
// migration file for a private constant is the wrong direction of
// dependency for a LATER migration to take on an EARLIER one, so these two
// well-known, stable role display names are duplicated here as plain
// literals instead.
const SYSTEM_ADMIN_ROLE_NAME = "System Admin";
const AUDITOR_ROLE_NAME = "Auditor";

/**
 * Phase 6 Slice 8 (Part 4) — mints `payments:receipt:view-all`
 * (`platform/users/domain/permission-catalogue.ts`), the gate for
 * `ReceiptsController.list()`'s new unscoped (neither `studentId` nor
 * `sessionId` given) global Receipts list branch — a real privacy
 * escalation over the existing `payments:receipt:view` (which only lets a
 * caller view one student's/one session's receipts), so it's a separate,
 * separately-granted permission rather than folded into `:view`.
 *
 * Seeded via a small, standalone migration rather than editing the
 * already-applied `0900-seed-permissions-and-roles.ts` — a migration that
 * has already run against a real environment is never edited retroactively
 * (TypeORM only re-runs a migration that hasn't been recorded yet; editing
 * `0900` now would have zero effect on any environment where it already
 * ran, and would misrepresent what that migration actually did when it
 * ran). Confirmed by grepping every migration numbered after `0900` before
 * writing this one: none of them adds a single new permission this way yet
 * — this is the first real precedent for "add one permission after the
 * initial 0900 seed," not a rediscovery of an existing pattern.
 *
 * Idempotent (`usr_permission` upsert by `code`, same `ON CONFLICT` shape
 * `0900`'s own loop uses; `usr_role_permission` insert is
 * `ON CONFLICT (role_id, permission_id) DO NOTHING`, same shape `0900`'s own
 * `grantPermission()` helper uses) and grants the new permission to the same
 * two roles `0900` grants every `isWrite:false` permission to: `System
 * Admin` (every permission, per that role's own "full access" design) and
 * `Auditor` (BR-SEC-04 — every non-write permission).
 */
export class AddPaymentsReceiptViewAllPermission0230 implements MigrationInterface {
  name = "AddPaymentsReceiptViewAllPermission1700000000230";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const entry = PERMISSION_CATALOGUE.find((p) => p.code === PERMISSION_CODE);
    if (!entry) {
      throw new Error(
        `AddPaymentsReceiptViewAllPermission0230: "${PERMISSION_CODE}" not found in PERMISSION_CATALOGUE — ` +
          "this migration must run against a checkout where that entry already exists.",
      );
    }

    const rows: Array<{ id: string }> = await queryRunner.query(
      `
      INSERT INTO app.usr_permission (id, code, module, description, is_write)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (code) DO UPDATE SET
        module = EXCLUDED.module,
        description = EXCLUDED.description,
        is_write = EXCLUDED.is_write
      RETURNING id
      `,
      [generateUuidV7(), entry.code, entry.module, entry.description, entry.isWrite],
    );
    const permissionId = rows[0].id;

    const roleRows: Array<{ id: string; name: string }> = await queryRunner.query(
      `SELECT id, name FROM app.usr_role WHERE name IN ($1, $2)`,
      [SYSTEM_ADMIN_ROLE_NAME, AUDITOR_ROLE_NAME],
    );
    for (const role of roleRows) {
      await queryRunner.query(
        `
        INSERT INTO app.usr_role_permission (id, role_id, permission_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (role_id, permission_id) DO NOTHING
        `,
        [generateUuidV7(), role.id, permissionId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permissionRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.usr_permission WHERE code = $1`, [
      PERMISSION_CODE,
    ]);
    for (const permission of permissionRows) {
      await queryRunner.query(`DELETE FROM app.usr_role_permission WHERE permission_id = $1`, [permission.id]);
    }
    await queryRunner.query(`DELETE FROM app.usr_permission WHERE code = $1`, [PERMISSION_CODE]);
  }
}
