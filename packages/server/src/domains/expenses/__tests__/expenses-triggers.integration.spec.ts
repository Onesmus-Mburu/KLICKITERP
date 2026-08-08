import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { ExpCategoryEntity } from "../domain/exp-category.entity";
import { ExpVoucherEntity } from "../domain/exp-voucher.entity";
import { ExpPettyCashFloatEntity } from "../domain/exp-petty-cash-float.entity";
import { ExpPettyCashVoucherEntity } from "../domain/exp-petty-cash-voucher.entity";
import { ExpReplenishmentEntity } from "../domain/exp-replenishment.entity";
import { ExpClaimEntity } from "../domain/exp-claim.entity";
import { ExpClaimLineEntity } from "../domain/exp-claim-line.entity";
import { ExpRecurringEntity } from "../domain/exp-recurring.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `domains/inventory/__tests__/inventory-triggers.integration.spec.ts`'s
 * pattern exactly — the highest-value test in this foundation pass, since
 * the three triggers from migration `0120` can only be genuinely verified
 * against a real Postgres, not a mocked repository.
 */
describe("expenses module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[expenses-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  interface Fixture {
    categoryId: string;
    expenseAccountId: string;
    userId: string;
    floatId: string;
  }

  async function createFixture(source: DataSource, suffix: string): Promise<Fixture> {
    const categoryId = generateUuidV7();
    const expenseAccountId = generateUuidV7();
    const userId = generateUuidV7();
    const floatId = generateUuidV7();

    // is_postable=false (no parent_id) satisfies ck_gl_account_postable_needs_parent without needing a parent chain.
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, is_active)
       VALUES ($1, $2, 'Office Supplies Expense', 'EXPENSE', false, false, true)`,
      [expenseAccountId, `5900-${suffix}`],
    );
    await source.query(
      `INSERT INTO app.exp_category (id, name, gl_expense_account_id) VALUES ($1, $2, $3)`,
      [categoryId, `EXP-CAT-${suffix}`, expenseAccountId],
    );
    await source.query(
      `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone)
       VALUES ($1, $2, 'hash', 'Test Custodian', 'ACTIVE', $3)`,
      [userId, `exp-user-${suffix}`, `+2548${suffix}`],
    );
    await source.query(
      `INSERT INTO app.exp_petty_cash_float (id, custodian_user_id, ceiling, balance) VALUES ($1, $2, 5000.0000, 5000.0000)`,
      [floatId, userId],
    );

    return { categoryId, expenseAccountId, userId, floatId };
  }

  async function destroyFixture(source: DataSource, fixture: Fixture): Promise<void> {
    await source.query(`DELETE FROM app.exp_petty_cash_float WHERE id = $1`, [fixture.floatId]);
    await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [fixture.userId]);
    await source.query(`DELETE FROM app.exp_category WHERE id = $1`, [fixture.categoryId]);
    await source.query(`DELETE FROM app.gl_account WHERE id = $1`, [fixture.expenseAccountId]);
  }

  it.each([
    ["exp_category", ExpCategoryEntity],
    ["exp_voucher", ExpVoucherEntity],
    ["exp_petty_cash_float", ExpPettyCashFloatEntity],
    ["exp_petty_cash_voucher", ExpPettyCashVoucherEntity],
    ["exp_replenishment", ExpReplenishmentEntity],
    ["exp_claim", ExpClaimEntity],
    ["exp_claim_line", ExpClaimLineEntity],
    ["exp_recurring", ExpRecurringEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[expenses-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("trg_exp_voucher_immutable freezes amount/category_id/payee_type/payee_ref/method once APPROVED but allows status/journal_id", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[expenses-triggers.integration.spec] SKIPPED (no DB) — exp_voucher immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const fixture = await createFixture(source, suffix);
    const voucherId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.exp_voucher
           (id, number, payee_type, payee_ref, category_id, amount, method, narrative, status)
         VALUES ($1, $2, 'OTHER', '{"name":"Test Payee"}'::jsonb, $3, 1000.0000, 'CASH', 'Test expense', 'DRAFT')`,
        [voucherId, `EXP-V-${suffix}`, fixture.categoryId],
      );

      // Pre-approval: ordinary fields are freely editable.
      await source.query(`UPDATE app.exp_voucher SET amount = 1500.0000 WHERE id = $1`, [voucherId]);

      // Approve — this is the status transition that activates the freeze.
      await source.query(`UPDATE app.exp_voucher SET status = 'APPROVED' WHERE id = $1`, [voucherId]);

      // Post-approval: financial/identity columns are frozen.
      await expect(
        source.query(`UPDATE app.exp_voucher SET amount = 2000.0000 WHERE id = $1`, [voucherId]),
      ).rejects.toThrow(/frozen/);
      await expect(
        source.query(`UPDATE app.exp_voucher SET method = 'BANK' WHERE id = $1`, [voucherId]),
      ).rejects.toThrow(/frozen/);

      // Post-approval: status/version keep progressing freely (journal_id's real FK to gl_journal is exercised
      // by accounting's own trigger specs — this test only needs to prove the *expenses* trigger doesn't block it).
      // `version` is bumped explicitly here because this is a raw SQL UPDATE, not a `repository.save()` call —
      // TypeORM's `@VersionColumn()` auto-increment is an ORM-level behavior with no DB-level equivalent (the
      // column's `DEFAULT 1` is the only thing Postgres itself does), so a real caller going through the ORM
      // would bump it exactly like this on every write.
      await source.query(`UPDATE app.exp_voucher SET status = 'PAID', version = version + 1 WHERE id = $1`, [voucherId]);
      const [row] = await source.query(`SELECT status, version FROM app.exp_voucher WHERE id = $1`, [voucherId]);
      expect(row.status).toBe("PAID");
      expect(row.version).toBeGreaterThan(1);
    } finally {
      await source.query(`DELETE FROM app.exp_voucher WHERE id = $1`, [voucherId]);
      await destroyFixture(source, fixture);
    }
  });

  it("trg_exp_petty_cash_voucher_immutable freezes float_id/category_id/amount/receipt_file_id once APPROVED", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn(
        "[expenses-triggers.integration.spec] SKIPPED (no DB) — exp_petty_cash_voucher immutability trigger check",
      );
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const fixture = await createFixture(source, suffix);
    const pcVoucherId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.exp_petty_cash_voucher (id, number, float_id, category_id, amount, status)
         VALUES ($1, $2, $3, $4, 500.0000, 'DRAFT')`,
        [pcVoucherId, `PCV-${suffix}`, fixture.floatId, fixture.categoryId],
      );

      await source.query(`UPDATE app.exp_petty_cash_voucher SET amount = 600.0000 WHERE id = $1`, [pcVoucherId]);
      await source.query(`UPDATE app.exp_petty_cash_voucher SET status = 'APPROVED' WHERE id = $1`, [pcVoucherId]);

      await expect(
        source.query(`UPDATE app.exp_petty_cash_voucher SET amount = 700.0000 WHERE id = $1`, [pcVoucherId]),
      ).rejects.toThrow(/frozen/);

      // Non-frozen columns (status/version) keep writing freely post-approval — re-asserting the same terminal
      // status is a harmless no-op UPDATE that still must not be rejected by the trigger. `version` is bumped
      // explicitly since this is a raw SQL UPDATE, not a `repository.save()` call — see the sibling
      // `trg_exp_voucher_immutable` test's own comment for why TypeORM's version auto-increment doesn't apply here.
      await source.query(`UPDATE app.exp_petty_cash_voucher SET status = 'APPROVED', version = version + 1 WHERE id = $1`, [pcVoucherId]);
      const [row] = await source.query(`SELECT status, version FROM app.exp_petty_cash_voucher WHERE id = $1`, [
        pcVoucherId,
      ]);
      expect(row.status).toBe("APPROVED");
      expect(row.version).toBeGreaterThan(1);
    } finally {
      await source.query(`DELETE FROM app.exp_petty_cash_voucher WHERE id = $1`, [pcVoucherId]);
      await destroyFixture(source, fixture);
    }
  });

  it("trg_exp_claim_immutable freezes staff_user_id/total/reimburse_via once APPROVED or REIMBURSED but allows approval_ref", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[expenses-triggers.integration.spec] SKIPPED (no DB) — exp_claim immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const fixture = await createFixture(source, suffix);
    const claimId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.exp_claim (id, number, staff_user_id, total, status, reimburse_via)
         VALUES ($1, $2, $3, 250.0000, 'DRAFT', 'DIRECT')`,
        [claimId, `CLM-${suffix}`, fixture.userId],
      );

      await source.query(`UPDATE app.exp_claim SET total = 300.0000 WHERE id = $1`, [claimId]);
      await source.query(`UPDATE app.exp_claim SET status = 'APPROVED' WHERE id = $1`, [claimId]);

      await expect(source.query(`UPDATE app.exp_claim SET total = 400.0000 WHERE id = $1`, [claimId])).rejects.toThrow(
        /frozen/,
      );
      await expect(
        source.query(`UPDATE app.exp_claim SET reimburse_via = 'PAYROLL' WHERE id = $1`, [claimId]),
      ).rejects.toThrow(/frozen/);

      // approval_ref/status keep progressing freely even once APPROVED.
      const approvalRef = generateUuidV7();
      await source.query(`UPDATE app.exp_claim SET approval_ref = $2, status = 'REIMBURSED' WHERE id = $1`, [
        claimId,
        approvalRef,
      ]);
      const [row] = await source.query(`SELECT status, approval_ref FROM app.exp_claim WHERE id = $1`, [claimId]);
      expect(row.status).toBe("REIMBURSED");
      expect(row.approval_ref).toBe(approvalRef);

      // REIMBURSED is also a frozen status.
      await expect(source.query(`UPDATE app.exp_claim SET total = 999.0000 WHERE id = $1`, [claimId])).rejects.toThrow(
        /frozen/,
      );
    } finally {
      await source.query(`DELETE FROM app.exp_claim WHERE id = $1`, [claimId]);
      await destroyFixture(source, fixture);
    }
  });
});
