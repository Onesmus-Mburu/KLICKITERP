import { DataSource } from "typeorm";
import { AppDataSource } from "../../migrations/data-source";
import { runInTransaction } from "../../shared/database/tx";
import { generateUuidV7 } from "../../shared/ids/uuid7";
import { Money } from "../../shared/money/money";
import { NumberingService } from "../../platform/settings";
import { PostingService } from "../application/posting.service";
import { GlAccountRepository } from "../infrastructure/gl-account.repository";
import { GlJournalLineRepository } from "../infrastructure/gl-journal-line.repository";
import { GlJournalRepository } from "../infrastructure/gl-journal.repository";
import { GlPeriodAccountTotalRepository } from "../infrastructure/gl-period-account-total.repository";
import { GlPeriodRepository } from "../infrastructure/gl-period.repository";
import { GlAccountEntity } from "../domain/gl-account.entity";
import { GlJournalLineEntity } from "../domain/gl-journal-line.entity";
import { GlJournalEntity } from "../domain/gl-journal.entity";
import { GlPeriodAccountTotalEntity } from "../domain/gl-period-account-total.entity";
import { GlPeriodEntity } from "../domain/gl-period.entity";

/**
 * The capstone test for the whole accounting core application-layer pass:
 * posts a real, balanced journal through `PostingService.post()` end-to-end
 * against a real Postgres instance — the only way to genuinely prove the
 * `SET LOCAL application_name` writer-guard workaround actually admits the
 * write past `trg_gl_writer_guard`, and that `trg_gl_journal_balanced`'s
 * deferred constraint trigger doesn't fire a false positive on a correctly
 * balanced journal. Self-skips (not fails) without Docker, same
 * connectivity-probe pattern as every prior module's integration spec.
 *
 * Services are instantiated directly (not through Nest DI) against real
 * repository wrappers bound to `AppDataSource.getRepository()`, mirroring
 * `platform/settings/__tests__/settings.integration.spec.ts`'s pattern.
 * `NumberingService.allocate()` never touches its injected
 * `SetNumberingSeriesRepository`/`AcademicCalendarService` (it works
 * directly off the caller's `EntityManager` and this test's `GL_JOURNAL`
 * series defaults to `reset_policy=NEVER` on first use), so both are stood
 * in with harmless placeholders — same precedent as that settings spec.
 */
describe("accounting module — posting integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[posting.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("posts a balanced MANUAL journal end-to-end and correctly maintains gl_period_account_total", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[posting.integration.spec] SKIPPED (no DB) — end-to-end PostingService.post() check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();

    const postingService = new PostingService(
      new GlJournalRepository(source.getRepository(GlJournalEntity)),
      new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
      new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity)),
      new GlAccountRepository(source.getRepository(GlAccountEntity)),
      new GlPeriodRepository(source.getRepository(GlPeriodEntity)),
      new NumberingService(
        // `platform/settings`' barrel deliberately doesn't export the repository/service classes below
        // (module anatomy — only application services leave the module), and `allocate()` never touches
        // either of them: it works directly off the caller's EntityManager, and GL_JOURNAL defaults to
        // reset_policy=NEVER on first use (see NumberingService's own doc comment) — same precedent as
        // `platform/settings/__tests__/settings.integration.spec.ts`'s concurrency test.
        {} as ConstructorParameters<typeof NumberingService>[0],
        {} as ConstructorParameters<typeof NumberingService>[1],
      ),
    );

    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const costCenterId = generateUuidV7();
    const cashAccountId = generateUuidV7();
    const revenueAccountId = generateUuidV7();

    await source.query(
      `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
      [fiscalYearId, `POST-FY-${String(suffix).slice(-8)}`],
    );
    await source.query(
      `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
      [periodId, fiscalYearId],
    );
    await source.query(
      `INSERT INTO app.gl_cost_center (id, code, name, is_active) VALUES ($1, $2, 'Posting Test CC', true)`,
      [costCenterId, `POST-CC-${String(suffix).slice(-8)}`],
    );
    // ck_gl_account_postable_needs_parent (migration 0060) requires is_postable=true rows to have
    // a real parent_id — hang these off the seeded top-level Assets/Income accounts.
    const [assetsParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
    const [incomeParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '4000'`);
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, 'Posting Test Cash', 'ASSET', $3, true, false, true)`,
      [cashAccountId, `POST-CASH-${String(suffix).slice(-8)}`, assetsParent?.id ?? null],
    );
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, 'Posting Test Revenue', 'INCOME', $3, true, false, true)`,
      [revenueAccountId, `POST-REV-${String(suffix).slice(-8)}`, incomeParent?.id ?? null],
    );

    try {
      const journal = await runInTransaction(source, (manager) =>
        postingService.post(manager, {
          journalDate: "2026-01-15",
          // Explicit periodId, not left to resolvePeriod()'s date-based
          // findCurrentForDate() fallback: every prior e2e/trigger capstone spec in this codebase
          // deliberately creates its own wide-open OPEN gl_period row and leaves it as permanent,
          // inert residue at teardown (immutable postings RESTRICT-block deletion — see every other
          // spec's own "left as inert residue" comments). After enough runs, MANY OPEN periods end
          // up overlapping this test's own 2026-01-15 date, so findCurrentForDate()'s undordered
          // findOne() can non-deterministically resolve to a DIFFERENT period than the one this
          // test just created and later queries gl_period_account_total against by this exact
          // periodId — making `cashTotal` come back undefined despite PostingService.post() itself
          // behaving correctly. Passing periodId explicitly removes the ambiguity entirely.
          periodId,
          sourceModule: "TEST",
          narration: "posting integration test",
          journalType: "MANUAL",
          postedBy: generateUuidV7(),
          lines: [
            { accountId: cashAccountId, costCenterId, debit: Money.fromInt(500), credit: Money.ZERO },
            { accountId: revenueAccountId, costCenterId, debit: Money.ZERO, credit: Money.fromInt(500) },
          ],
        }),
      );

      expect(journal.number).toMatch(/^GL_-\d+$/);
      expect(journal.lines).toHaveLength(2);

      const persistedLines = await source
        .getRepository(GlJournalLineEntity)
        .find({ where: { journalId: journal.id }, order: { lineNo: "ASC" } });
      expect(persistedLines).toHaveLength(2);
      expect(persistedLines[0].debit.equals(Money.fromInt(500))).toBe(true);
      expect(persistedLines[1].credit.equals(Money.fromInt(500))).toBe(true);

      const cashTotal = await source
        .getRepository(GlPeriodAccountTotalEntity)
        .findOne({ where: { periodId, accountId: cashAccountId, costCenterId } });
      expect(cashTotal?.debitTotal.equals(Money.fromInt(500))).toBe(true);
      expect(cashTotal?.creditTotal.equals(Money.ZERO)).toBe(true);

      const revenueTotal = await source
        .getRepository(GlPeriodAccountTotalEntity)
        .findOne({ where: { periodId, accountId: revenueAccountId, costCenterId } });
      expect(revenueTotal?.creditTotal.equals(Money.fromInt(500))).toBe(true);

      // A second posting to the same (period, account, cost_center) must increment in place, not duplicate the row.
      await runInTransaction(source, (manager) =>
        postingService.post(manager, {
          journalDate: "2026-01-16",
          periodId, // see the first post() call's comment above.
          sourceModule: "TEST",
          narration: "posting integration test — second posting",
          journalType: "MANUAL",
          postedBy: generateUuidV7(),
          lines: [
            { accountId: cashAccountId, costCenterId, debit: Money.fromInt(250), credit: Money.ZERO },
            { accountId: revenueAccountId, costCenterId, debit: Money.ZERO, credit: Money.fromInt(250) },
          ],
        }),
      );

      const cashTotalRows = await source
        .getRepository(GlPeriodAccountTotalEntity)
        .find({ where: { periodId, accountId: cashAccountId, costCenterId } });
      expect(cashTotalRows).toHaveLength(1);
      expect(cashTotalRows[0].debitTotal.equals(Money.fromInt(750))).toBe(true);
    } finally {
      // This test posts a real balanced journal, so gl_journal_line/gl_journal are permanently
      // immutable (trg_gl_journal_immutable, BR-GEN-03 — confirmed by direct testing), which
      // transitively blocks gl_period_account_total (writer-guarded, RESTRICT-referenced) and
      // gl_account/gl_period/gl_cost_center/gl_fiscal_year (also RESTRICT-referenced, directly or
      // transitively) from ever being deleted. Left as inert, uniquely-suffixed residue — same
      // precedent as reporting-foundation.integration.spec.ts's own GL cleanup fix.
    }
  }, 30_000);
});
