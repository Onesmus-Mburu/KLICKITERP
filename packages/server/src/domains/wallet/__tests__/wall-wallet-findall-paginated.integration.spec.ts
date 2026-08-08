import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { WallWalletEntity } from "../domain/wall-wallet.entity";
import { WallWalletRepository } from "../infrastructure/wall-wallet.repository";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, same
 * pattern as `pending-upcoming-invoices.integration.spec.ts` (Slice 8 Part
 * 2) / `pay-receipt-findall-paginated.integration.spec.ts` (Slice 8 Part 4),
 * which this test otherwise mirrors closely: Phase 6 Slice 11 (Part 2)'s
 * `WallWalletRepository.findAllPaginated()` (the new Wallets list screen's
 * backing query) joins/ILIKE-filters/paginates via real raw SQL comparisons
 * that can only be genuinely proven against a real Postgres instance, not a
 * mocked `QueryBuilder`.
 *
 * `wall_wallet` has no FK to `gl_journal` (unlike `pay_receipt`/`bill_invoice`
 * — confirmed by reading migration `0090`'s `CREATE TABLE app.wall_wallet`
 * directly), so fixture setup here is much lighter than either precedent:
 * just a class + 3 students + 3 wallets, no GL/journal scaffolding needed.
 *
 * Deliberately does NOT assume an empty `wall_wallet` table — every
 * assertion below either checks presence/absence of this test's own known
 * wallet ids within a real result set (robust regardless of how much other
 * real wallet data already exists in whatever dev DB this runs against), or
 * scopes by this fixture's own uniquely-suffixed admission numbers/names.
 */
describe("WallWalletRepository.findAllPaginated — Phase 6 Slice 11 (Part 2), Wallets list (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;
  let repository: WallWalletRepository;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
      repository = new WallWalletRepository(dataSource.getRepository(WallWalletEntity));
    } catch (error) {
      console.warn(
        `[wall-wallet-findall-paginated.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "joins student, ILIKE-filters by name/admission number, orders by student name, and paginates correctly",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[wall-wallet-findall-paginated.integration.spec] SKIPPED (no DB) — findAllPaginated join/filter/pagination check");
        return;
      }
      const source = dataSource;
      const suffix = `${Date.now()}`.slice(-10);

      const classId = generateUuidV7();
      const student1Id = generateUuidV7(); // "Wall Amos" — first alphabetically
      const student2Id = generateUuidV7(); // "Wall Zawadi"
      const student3Id = generateUuidV7(); // "Wall Brian" — different admission-no fragment
      const wallet1Id = generateUuidV7();
      const wallet2Id = generateUuidV7();
      const wallet3Id = generateUuidV7();

      try {
        await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [classId, `WALL-CLASS-${suffix}`]);
        await source.query(
          `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'Wall', 'Amos', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
          [student1Id, `WALL-ADM1-${suffix}`, classId],
        );
        await source.query(
          `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'Wall', 'Zawadi', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
          [student2Id, `WALL-ADM2-${suffix}`, classId],
        );
        await source.query(
          `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'Wall', 'Brian', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
          [student3Id, `WALL-ADM3-${suffix}`, classId],
        );

        await source.query(
          `INSERT INTO app.wall_wallet (id, student_id, status, balance, overdraft_limit)
           VALUES ($1, $2, 'ACTIVE', 500.0000, 0)`,
          [wallet1Id, student1Id],
        );
        await source.query(
          `INSERT INTO app.wall_wallet (id, student_id, status, balance, overdraft_limit)
           VALUES ($1, $2, 'LOCKED', 250.0000, 100.0000)`,
          [wallet2Id, student2Id],
        );
        await source.query(
          `INSERT INTO app.wall_wallet (id, student_id, status, balance, overdraft_limit)
           VALUES ($1, $2, 'ACTIVE', 0.0000, 0)`,
          [wallet3Id, student3Id],
        );

        // ---- No filter: all 3 present, real joined student fields populated.
        const all = await repository.findAllPaginated({}, { skip: 0, take: 100000 });
        const allIds = all.items.map((w) => w.id);
        expect(allIds).toContain(wallet1Id);
        expect(allIds).toContain(wallet2Id);
        expect(allIds).toContain(wallet3Id);
        const wallet1Row = all.items.find((w) => w.id === wallet1Id);
        expect(wallet1Row?.student?.admissionNo).toBe(`WALL-ADM1-${suffix}`);
        expect(wallet1Row?.student?.firstName).toBe("Wall");
        expect(wallet1Row?.status).toBe("ACTIVE");

        // ---- Ordered by student name ASC: among this fixture's own 3 rows, Amos < Brian < Zawadi.
        const ourOrder = allIds.filter((id) => [wallet1Id, wallet2Id, wallet3Id].includes(id));
        expect(ourOrder).toEqual([wallet1Id, wallet3Id, wallet2Id]);

        // ---- q ILIKE match against plain first+last name concat.
        const byFullName = await repository.findAllPaginated({ q: "wall amos" }, { skip: 0, take: 100000 });
        expect(byFullName.items.map((w) => w.id)).toEqual([wallet1Id]);

        // ---- q ILIKE match against admission_no fragment.
        const byAdmissionNo = await repository.findAllPaginated({ q: `WALL-ADM2-${suffix}` }, { skip: 0, take: 100000 });
        expect(byAdmissionNo.items.map((w) => w.id)).toEqual([wallet2Id]);

        // ---- q with no match anywhere in this fixture.
        const byNoMatch = await repository.findAllPaginated({ q: `no-such-admission-${suffix}` }, { skip: 0, take: 100000 });
        const byNoMatchIds = byNoMatch.items.map((w) => w.id);
        expect(byNoMatchIds).not.toContain(wallet1Id);
        expect(byNoMatchIds).not.toContain(wallet2Id);
        expect(byNoMatchIds).not.toContain(wallet3Id);

        // ---- pagination scoped by this fixture's own uniquely-suffixed admission numbers (DB-noise-independent): each of the 3 matches exactly 1 real row.
        const scopedBySuffix1 = await repository.findAllPaginated({ q: `WALL-ADM1-${suffix}` }, { skip: 0, take: 100000 });
        const scopedBySuffix2 = await repository.findAllPaginated({ q: `WALL-ADM2-${suffix}` }, { skip: 0, take: 100000 });
        const scopedBySuffix3 = await repository.findAllPaginated({ q: `WALL-ADM3-${suffix}` }, { skip: 0, take: 100000 });
        expect(scopedBySuffix1.total).toBe(1);
        expect(scopedBySuffix2.total).toBe(1);
        expect(scopedBySuffix3.total).toBe(1);

        // ---- Real take/skip pagination proof, scoped to exactly this fixture's own 3 rows via the shared `-${suffix}` admission-number fragment (DB-noise-independent — no other row in this dev DB plausibly shares this exact numeric suffix): take:2 on page 1 returns 2, total is 3; page 2 (skip:2) returns the remaining 1 with zero id overlap with page 1.
        const fixturePage1 = await repository.findAllPaginated({ q: `-${suffix}` }, { skip: 0, take: 2 });
        expect(fixturePage1.items).toHaveLength(2);
        expect(fixturePage1.total).toBe(3);
        const fixturePage2 = await repository.findAllPaginated({ q: `-${suffix}` }, { skip: 2, take: 2 });
        expect(fixturePage2.items).toHaveLength(1);
        expect(fixturePage2.total).toBe(3);
        const page1Ids = fixturePage1.items.map((w) => w.id);
        const page2Ids = fixturePage2.items.map((w) => w.id);
        expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);

        // ---- Real take-limits-rows proof against the WHOLE unfiltered table (not just this fixture): take:1 returns exactly 1 row, total reflects the true unfiltered count.
        // Deliberately NOT asserting `takeOne.total === all.total` — this file's OWN unfiltered
        // `total` is a real live count across the whole `wall_wallet` table, which under this
        // project's `--maxWorkers=2` parallel Jest execution can genuinely change between two
        // separate queries in this test if another integration spec file (e.g.
        // `wallet-e2e.integration.spec.ts`, which creates+deletes its own real wallet row
        // mid-run) writes concurrently — a real, confirmed race, not a bug in `findAllPaginated()`
        // itself (caught live: this assertion flaked 7 vs 6 on a real concurrent run before being
        // loosened here). `>= 3` (this fixture's own 3 rows, always present at this point) is the
        // robust, concurrency-safe version of the same proof.
        const takeOne = await repository.findAllPaginated({}, { skip: 0, take: 1 });
        expect(takeOne.items).toHaveLength(1);
        expect(takeOne.total).toBeGreaterThanOrEqual(3);
      } finally {
        await source.query(`DELETE FROM app.wall_wallet WHERE id = ANY($1::uuid[])`, [[wallet1Id, wallet2Id, wallet3Id]]);
        await source.query(`DELETE FROM app.std_student WHERE id = ANY($1::uuid[])`, [[student1Id, student2Id, student3Id]]);
        await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
      }
    },
  );
});
