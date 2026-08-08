import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";

import { SetNumberingSeriesEntity } from "../../../platform/settings/domain/set-numbering-series.entity";
import { SetNumberingSeriesRepository } from "../../../platform/settings/infrastructure/set-numbering-series.repository";
import { NumberingService } from "../../../platform/settings/application/numbering.service";
import { AcademicCalendarService } from "../../../platform/settings/application/academic-calendar.service";

import {
  ApprovalEngineService,
  ApprWorkflowDefEntity,
  ApprWorkflowVersionEntity,
  ApprLevelEntity,
  ApprRoutingRuleEntity,
  ApprInstanceEntity,
  ApprActionEntity,
  DelegationsService,
} from "../../../platform/approvals";
import { ApprWorkflowDefRepository } from "../../../platform/approvals/infrastructure/appr-workflow-def.repository";
import { ApprWorkflowVersionRepository } from "../../../platform/approvals/infrastructure/appr-workflow-version.repository";
import { ApprLevelRepository } from "../../../platform/approvals/infrastructure/appr-level.repository";
import { ApprRoutingRuleRepository } from "../../../platform/approvals/infrastructure/appr-routing-rule.repository";
import { ApprInstanceRepository } from "../../../platform/approvals/infrastructure/appr-instance.repository";
import { ApprActionRepository } from "../../../platform/approvals/infrastructure/appr-action.repository";
import { UsersService, DepartmentsService } from "../../../platform/users";

import { GlAccountRepository, PostingService } from "../../../accounting";
import { GlAccountEntity } from "../../../accounting/domain/gl-account.entity";
import { GlJournalEntity } from "../../../accounting/domain/gl-journal.entity";
import { GlJournalLineEntity } from "../../../accounting/domain/gl-journal-line.entity";
import { GlJournalLineRepository } from "../../../accounting/infrastructure/gl-journal-line.repository";
import { GlJournalRepository } from "../../../accounting/infrastructure/gl-journal.repository";
import { GlPeriodAccountTotalEntity } from "../../../accounting/domain/gl-period-account-total.entity";
import { GlPeriodAccountTotalRepository } from "../../../accounting/infrastructure/gl-period-account-total.repository";
import { GlPeriodEntity } from "../../../accounting/domain/gl-period.entity";
import { GlPeriodRepository } from "../../../accounting/infrastructure/gl-period.repository";

import { InvCategoryEntity } from "../domain/inv-category.entity";
import { InvStoreEntity } from "../domain/inv-store.entity";
import { InvItemEntity } from "../domain/inv-item.entity";
import { InvStockBalanceEntity } from "../domain/inv-stock-balance.entity";
import { InvMovementEntity } from "../domain/inv-movement.entity";
import { InvStockTakeEntity } from "../domain/inv-stock-take.entity";
import { InvStockTakeLineEntity } from "../domain/inv-stock-take-line.entity";

import { InvCategoryRepository } from "../infrastructure/inv-category.repository";
import { InvStoreRepository } from "../infrastructure/inv-store.repository";
import { InvItemRepository } from "../infrastructure/inv-item.repository";
import { InvStockBalanceRepository } from "../infrastructure/inv-stock-balance.repository";
import { InvMovementRepository } from "../infrastructure/inv-movement.repository";
import { InvStockTakeRepository } from "../infrastructure/inv-stock-take.repository";
import { InvStockTakeLineRepository } from "../infrastructure/inv-stock-take-line.repository";

import { CategoriesService } from "../application/categories.service";
import { StoresService } from "../application/stores.service";
import { ItemsService } from "../application/items.service";
import { StockMovementsService } from "../application/stock-movements.service";
import { StockTakesService } from "../application/stock-takes.service";

/**
 * The capstone integration test for Module 13 (Inventory) — walks: create
 * item+store -> receive stock (weighted-average) -> issue some -> run a
 * stock-take that finds a shrinkage variance -> submit for
 * `STOCK_ADJUSTMENTS` approval -> a REAL `ApprovalEngineService.decide()`
 * (not a manual-trigger stand-in, since `StockTakesService.post()` verifies
 * the underlying `appr_instance`'s OWN `status` column directly — see that
 * service's `onApprovalDecided()` doc comment for why) -> post (P-24),
 * asserting balanced GL and the correct final `inv_stock_balance`. Mirrors
 * `domains/wallet/__tests__/wallet-e2e.integration.spec.ts`'s pattern (real
 * repository/service instances, no Nest DI, self-skips without Docker).
 *
 * **This test's assumption**: migrations up to and including `0900` have
 * already run — the `STOCK_ADJUSTMENTS` `appr_workflow_def`/`_version`/
 * `_level` and the `System Admin` `usr_role` must exist for
 * `submitForApproval()`/`decide()` to succeed, the same assumption every
 * other module's own e2e capstone states (`wallet-e2e`/`procurement-e2e`).
 * `UsersService`/`DepartmentsService`/`DelegationsService` are minimally
 * stubbed — `listActiveUsersByRoleId()` returns the test's own chosen
 * approver regardless of the role id argument, since this test exercises
 * Inventory's own flow, not RBAC/role-membership correctness (already
 * covered by `platform/approvals`' own test suite).
 */
describe("inventory module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[inventory-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "create item+store -> receive -> issue -> stock-take variance -> approve -> post (P-24), asserting balanced GL and final balance",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[inventory-e2e.integration.spec] SKIPPED (no DB) — end-to-end inventory capstone flow");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();

      // ---- Wide-enough gl_period.
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2015-01-01', '2035-12-31', 'OPEN')`,
        [fiscalYearId, `INV-E2E-FY-${String(suffix).slice(-8)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2015-01-01', '2035-12-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );

      // ---- GL accounts: reuse the 0900-seeded rows if present, else create throwaway fallbacks.
      async function reuseOrCreateByCode(
        code: string,
        name: string,
        klass: string,
        controlDomain: string | null,
      ): Promise<{ id: string; created: boolean }> {
        const existing: Array<{ id: string }> = await source.query(`SELECT id FROM app.gl_account WHERE code = $1`, [code]);
        if (existing.length > 0) return { id: existing[0].id, created: false };
        const id = generateUuidV7();
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, control_domain, is_active)
           VALUES ($1, $2, $3, $4, true, $5, $6, true)`,
          [id, code, name, klass, controlDomain !== null, controlDomain],
        );
        return { id, created: true };
      }
      const inventoryAccount = await reuseOrCreateByCode("1200", "Inventory", "ASSET", "INVENTORY");
      const lossAccount = await reuseOrCreateByCode("5070", "Stock Loss Expense", "EXPENSE", null);
      const expenseAccount = await reuseOrCreateByCode("5030", "Office Supplies Expense", "EXPENSE", null);
      const createdAccountIds = [inventoryAccount, lossAccount, expenseAccount].filter((a) => a.created).map((a) => a.id);

      // ---- System Admin role (0900-seeded) + two distinct users (initiator != approver, BR-APPR-01).
      const roleRows: Array<{ id: string }> = await source.query(`SELECT id FROM app.usr_role WHERE name = 'System Admin'`);
      if (roleRows.length === 0) {
        throw new Error("System Admin role not found — run migrations through 0900 first (see this test's own doc comment)");
      }
      const keeperUserId = generateUuidV7();
      const approverUserId = generateUuidV7();
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Keeper', 'ACTIVE', $3)`,
        // phone is varchar(20); "+2547" (5 chars) + a 13-digit Date.now() suffix is 18 chars, well
        // within budget — previously `.slice(0, 13)` truncated the WHOLE string (not just the
        // suffix) down to the first 8 digits of the timestamp, so phone only changed once per
        // ~100 real seconds and collided across test files/runs inside that window
        // (uq_usr_user_phone_p). Keep the full suffix instead — same fix applied to every other
        // e2e capstone spec with this exact bug (expenses/fixed-assets/banking/payments).
        [keeperUserId, `inv-e2e-keeper-${suffix}`, `+2547${suffix}`],
      );
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Approver', 'ACTIVE', $3)`,
        [approverUserId, `inv-e2e-approver-${suffix}`, `+2546${suffix}`],
      );

      // ---- Service instantiation (real repositories, no Nest DI — see class doc comment).
      const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
      const numberingSeriesRepository = new SetNumberingSeriesRepository(source.getRepository(SetNumberingSeriesEntity));
      const numberingService = new NumberingService(numberingSeriesRepository, {} as unknown as AcademicCalendarService);
      const glPeriodRepository = new GlPeriodRepository(source.getRepository(GlPeriodEntity));
      const glPeriodAccountTotalRepository = new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity));
      const postingService = new PostingService(
        new GlJournalRepository(source.getRepository(GlJournalEntity)),
        new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
        glPeriodAccountTotalRepository,
        glAccountRepository,
        glPeriodRepository,
        numberingService,
      );

      const usersServiceStub = {
        listActiveUsersByRoleId: async () => [{ id: approverUserId }],
        findByIdOrFail: async (id: string) => ({ id, departmentId: null }),
      } as unknown as UsersService;

      const approvalEngine = new ApprovalEngineService(
        source,
        new ApprWorkflowDefRepository(source.getRepository(ApprWorkflowDefEntity)),
        new ApprWorkflowVersionRepository(source.getRepository(ApprWorkflowVersionEntity)),
        new ApprLevelRepository(source.getRepository(ApprLevelEntity)),
        new ApprRoutingRuleRepository(source.getRepository(ApprRoutingRuleEntity)),
        new ApprInstanceRepository(source.getRepository(ApprInstanceEntity)),
        new ApprActionRepository(source.getRepository(ApprActionEntity)),
        usersServiceStub,
        {} as unknown as DepartmentsService, // never touched — no DEPT_HEAD level in the STOCK_ADJUSTMENTS seed.
        {} as unknown as DelegationsService, // never touched — the approver holds the role directly, no delegation path taken.
        new OutboxWriterService(),
      );

      const categoryRepository = new InvCategoryRepository(source.getRepository(InvCategoryEntity));
      const storeRepository = new InvStoreRepository(source.getRepository(InvStoreEntity));
      const itemRepository = new InvItemRepository(source.getRepository(InvItemEntity));
      const stockBalanceRepository = new InvStockBalanceRepository(source.getRepository(InvStockBalanceEntity));
      const movementRepository = new InvMovementRepository(source.getRepository(InvMovementEntity));
      // (transfers are exercised thoroughly by transfers.service.spec.ts's own issue->receive round trip; not re-covered here)
      const stockTakeRepository = new InvStockTakeRepository(source.getRepository(InvStockTakeEntity));
      const stockTakeLineRepository = new InvStockTakeLineRepository(source.getRepository(InvStockTakeLineEntity));

      const categoriesService = new CategoriesService(categoryRepository);
      const storesService = new StoresService(storeRepository);
      const itemsService = new ItemsService(itemRepository, categoryRepository);
      const stockMovementsService = new StockMovementsService(stockBalanceRepository, movementRepository, itemRepository, stockTakeRepository);
      const stockTakesService = new StockTakesService(
        stockTakeRepository,
        stockTakeLineRepository,
        stockBalanceRepository,
        itemRepository,
        stockMovementsService,
        approvalEngine,
        postingService,
        glAccountRepository,
        numberingService,
      );

      let storeId: string | null = null;
      let itemId: string | null = null;
      let approvalInstanceId: string | null = null;

      try {
        // ---- create item + store -------------------------------------------
        const category = await categoriesService.create({ name: `INV-E2E-CAT-${suffix}` }, keeperUserId);
        const store = await storesService.create({ name: `INV-E2E-STORE-${suffix}`, location: "E2E Wing", keeperUserId }, keeperUserId);
        storeId = store.id;
        const item = await itemsService.create(
          {
            code: `INV-E2E-ITEM-${suffix}`,
            name: "E2E Widget",
            categoryId: category.id,
            uom: "EA",
            itemType: "STOCK",
            glAssetAccountId: inventoryAccount.id,
            glExpenseAccountId: expenseAccount.id,
          },
          keeperUserId,
        );
        itemId = item.id;

        // ---- receive 20 @ 10.00 (weighted average, first receipt) ----------
        await source.transaction("REPEATABLE READ", (em) =>
          stockMovementsService.recordReceipt(em, {
            itemId: item.id,
            storeId: store.id,
            qty: "20",
            unitCost: "10.000000",
            refDocType: "inv_e2e_receipt",
            refDocId: generateUuidV7(),
          }),
        );

        // ---- issue 5 (valued at avg_cost, no recalculation) -----------------
        await source.transaction("REPEATABLE READ", (em) =>
          stockMovementsService.recordIssue(em, { itemId: item.id, storeId: store.id, qty: "5", refDocType: "inv_e2e_issue", refDocId: generateUuidV7() }),
        );

        const preTakeBalance = await stockBalanceRepository.findByIdOrFail((await stockBalanceRepository.findByItemStore(item.id, store.id))!.id);
        expect(preTakeBalance.qty).toBe("15.0000");
        expect(preTakeBalance.value).toEqual(Money.fromDecimalString("150.00"));

        // ---- stock take: snapshot 15, counted 12 -> a 3-unit shrinkage ------
        const stockTake = await source.transaction("REPEATABLE READ", (em) =>
          stockTakesService.createSession(em, { storeId: store.id, scope: { itemIds: [item.id] } }, keeperUserId),
        );
        const lines = await stockTakeLineRepository.findByStockTakeId(stockTake.id);
        expect(lines).toHaveLength(1);
        expect(lines[0].snapshotQty).toBe("15.0000");

        await source.transaction("REPEATABLE READ", (em) =>
          stockTakesService.recordCounts(em, stockTake.id, [{ lineId: lines[0].id, countedQty: "12" }], keeperUserId),
        );

        // ---- BR-INV-03: an issue against the frozen item is rejected while the stock take is counting/review ----
        await expect(
          source.transaction("REPEATABLE READ", (em) =>
            stockMovementsService.recordIssue(em, { itemId: item.id, storeId: store.id, qty: "1", refDocType: "inv_e2e_blocked", refDocId: generateUuidV7() }),
          ),
        ).rejects.toThrow(/BR-INV-03/);

        const submitted = await source.transaction("REPEATABLE READ", (em) => stockTakesService.submitForApproval(em, stockTake.id, keeperUserId));
        expect(submitted.status).toBe("PENDING_APPROVAL");
        expect(submitted.approvalRef).toBeTruthy();
        approvalInstanceId = submitted.approvalRef!;

        // ---- a REAL approval decision (see class doc comment) --------------
        const decided = await approvalEngine.decide(submitted.approvalRef!, approverUserId, "APPROVE");
        expect(decided.status).toBe("APPROVED");

        // ---- post: P-24, a net 30.00 loss (3 units * 10.00 avg_cost) --------
        const posted = await source.transaction("REPEATABLE READ", (em) => stockTakesService.post(em, stockTake.id, approverUserId));
        expect(posted.status).toBe("POSTED");
        expect(posted.journalId).toBeTruthy();

        const finalBalance = await stockBalanceRepository.findByItemStore(item.id, store.id);
        expect(finalBalance!.qty).toBe("12.0000");
        expect(finalBalance!.value).toEqual(Money.fromDecimalString("120.00"));

        // ---- balanced GL: lossAccount debited 30.00, inventoryAccount credited 30.00 ----
        const [lossRow]: Array<{ balance: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::text AS balance FROM app.gl_journal_line jl WHERE jl.account_id = $1 AND jl.journal_id = $2`,
          [lossAccount.id, posted.journalId],
        );
        expect(Money.fromDecimalString(lossRow.balance)).toEqual(Money.fromDecimalString("30.00"));

        const [invRow]: Array<{ balance: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::text AS balance FROM app.gl_journal_line jl WHERE jl.account_id = $1 AND jl.journal_id = $2`,
          [inventoryAccount.id, posted.journalId],
        );
        expect(Money.fromDecimalString(invRow.balance)).toEqual(Money.fromDecimalString("30.00"));

        // ---- the physical adjustment movement itself, traceable to the stock-take line ----
        const movements = await movementRepository.listForItemStore(item.id, store.id);
        const adjustment = movements.find((m) => m.movementType === "ADJUSTMENT");
        expect(adjustment).toBeDefined();
        expect(adjustment!.qty).toBe("-3.0000");
        expect(adjustment!.refDocType).toBe("inv_stock_take_line");
        expect(adjustment!.refDocId).toBe(lines[0].id);
      } finally {
        if (itemId && storeId) {
          // `inv_movement` is a genuine append-only audit ledger — `trg_inv_movement_immutable`
          // (migration 0110) unconditionally rejects DELETE (and UPDATE), same conceptual shape
          // as `gl_journal`/`gl_journal_line`'s immutability elsewhere in this codebase. Once this
          // test posts a real movement, `inv_item`/`inv_store` also become permanently undeletable
          // (`fk_inv_movement_item_id`/`fk_inv_movement_store_id` are `ON DELETE RESTRICT`) — by
          // design, an item/store with real movement history can never be hard-deleted, only
          // deactivated. This test's fixtures are uniquely named per run (`suffix`), so leaving
          // them behind as inert residue doesn't break re-runnability.
          await source.query(`DELETE FROM app.inv_stock_take_line WHERE item_id = $1`, [itemId]);
          await source.query(`DELETE FROM app.inv_stock_take WHERE store_id = $1`, [storeId]);
          await source.query(`DELETE FROM app.inv_stock_balance WHERE item_id = $1 AND store_id = $2`, [itemId, storeId]);
        }
        // inv_category is still RESTRICT-referenced by the now-permanently-undeletable inv_item
        // above (fk_inv_item_category_id), and this test's gl_account rows are RESTRICT-referenced
        // by the real, permanently-immutable gl_journal_line rows this test posts — none of these
        // can succeed. Left as inert, uniquely-suffixed residue for the same reason.

        // appr_instance/appr_action are NOT immutable (no such trigger — unlike gl_journal*/
        // inv_movement above) but DO carry a RESTRICT FK from appr_instance.initiator_id to
        // usr_user, and this test's submitForApproval()+decide() call created exactly one real
        // instance/action pair referencing keeperUserId/approverUserId — delete those first so the
        // users themselves can be reclaimed instead of joining the inert-residue pile.
        if (approvalInstanceId) {
          await source.query(`DELETE FROM app.appr_action WHERE instance_id = $1`, [approvalInstanceId]);
          await source.query(`DELETE FROM app.appr_instance WHERE id = $1`, [approvalInstanceId]);
        }
        // keeperUserId is also still RESTRICT-referenced by inv_store.keeper_user_id
        // (fk_inv_store_keeper_user_id) — inv_store itself is left as inert residue above (blocked
        // by inv_movement's own immutability chain), so this specific user can never be reclaimed
        // either. approverUserId has no such reference once appr_action/appr_instance above are
        // gone, so it's safe. Best-effort per-row delete (same precedent as
        // banking-e2e.integration.spec.ts's own gl_account cleanup loop) rather than one batched
        // statement, so approverUserId's removal doesn't get aborted by keeperUserId's failure.
        for (const userId of [keeperUserId, approverUserId]) {
          try {
            await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [userId]);
          } catch {
            // expected for keeperUserId — see comment above.
          }
        }
      }
    },
    60000,
  );
});
