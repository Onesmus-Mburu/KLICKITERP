import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { StdStudentEntity } from "../domain/std-student.entity";
import { StdStudentRepository } from "../infrastructure/std-student.repository";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, same
 * connectivity-probe pattern as every prior module's integration spec (e.g.
 * `accounting/__tests__/accounting-triggers.integration.spec.ts`).
 *
 * Two things genuinely need a real Postgres to verify:
 *  1. `trg_std_student_exit_guard` (migration `0065`) — a real trigger
 *     rejection can only be proven against real Postgres.
 *  2. The trigram search (FR-PAY-002) — `pg_trgm`'s `%`/`similarity()`
 *     actually ranking results needs the real GIN index + extension.
 */
describe("students module — integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[students.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function insertClass(source: DataSource, name: string): Promise<string> {
    const id = generateUuidV7();
    await source.query(
      `INSERT INTO app.std_class (id, name, level, is_active) VALUES ($1, $2, 1, true)`,
      [id, name],
    );
    return id;
  }

  async function insertStudent(
    source: DataSource,
    classId: string,
    overrides: { admissionNo: string; firstName: string; lastName: string; status?: string; exitCleared?: boolean },
  ): Promise<string> {
    const id = generateUuidV7();
    await source.query(
      `
      INSERT INTO app.std_student
        (id, admission_no, first_name, last_name, class_id, status, boarding, custom_fields, enrolled_on, exit_cleared)
      VALUES ($1, $2, $3, $4, $5, $6, 'DAY', '{}'::jsonb, CURRENT_DATE, $7)
      `,
      [
        id,
        overrides.admissionNo,
        overrides.firstName,
        overrides.lastName,
        classId,
        overrides.status ?? "ACTIVE",
        overrides.exitCleared ?? false,
      ],
    );
    return id;
  }

  it("trg_std_student_exit_guard rejects ACTIVE -> ALUMNI when exit_cleared=false, and admits it once true", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[students.integration.spec] SKIPPED (no DB) — exit guard trigger check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();
    const classId = await insertClass(source, `EXIT-GUARD-${suffix}`);
    const studentId = await insertStudent(source, classId, {
      admissionNo: `ADM-EXIT-${suffix}`,
      firstName: "Exit",
      lastName: "Guard",
      status: "ACTIVE",
      exitCleared: false,
    });

    try {
      await expect(
        source.query(`UPDATE app.std_student SET status = 'ALUMNI' WHERE id = $1`, [studentId]),
      ).rejects.toThrow(/BR-BILL-15/);

      await source.query(`UPDATE app.std_student SET exit_cleared = true WHERE id = $1`, [studentId]);
      await source.query(`UPDATE app.std_student SET status = 'ALUMNI' WHERE id = $1`, [studentId]);

      const rows: Array<{ status: string }> = await source.query(
        `SELECT status FROM app.std_student WHERE id = $1`,
        [studentId],
      );
      expect(rows[0].status).toBe("ALUMNI");
    } finally {
      await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
      await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
    }
  }, 30_000);

  it("searchByNameOrAdmissionNo ranks the closest name/admission-number match first (FR-PAY-002)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[students.integration.spec] SKIPPED (no DB) — trigram search ranking check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();
    const classId = await insertClass(source, `SEARCH-${suffix}`);
    const targetId = await insertStudent(source, classId, {
      admissionNo: `ADM-SEARCH-${suffix}`,
      firstName: "Wanjiru",
      lastName: "Kamau",
    });
    const decoyId = await insertStudent(source, classId, {
      admissionNo: `ADM-DECOY-${suffix}`,
      firstName: "Zephaniah",
      lastName: "Otieno",
    });

    try {
      const repo = new StdStudentRepository(source.getRepository(StdStudentEntity));
      const results = await repo.searchByNameOrAdmissionNo("wanjiru kamau", 10, source.manager);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(targetId);
      expect(results.map((r) => r.id)).not.toContain(decoyId);
    } finally {
      await source.query(`DELETE FROM app.std_student WHERE id IN ($1, $2)`, [targetId, decoyId]);
      await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
    }
  }, 30_000);

  it("ck_std_guardian_contact (migration 0200) rejects a guardian with neither phone nor email, real Postgres CHECK", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[students.integration.spec] SKIPPED (no DB) — ck_std_guardian_contact check");
      return;
    }
    const source = dataSource;
    const id = generateUuidV7();

    await expect(
      source.query(
        `INSERT INTO app.std_guardian (id, full_name, phone, email) VALUES ($1, 'No Contact', NULL, NULL)`,
        [id],
      ),
    ).rejects.toThrow(/ck_std_guardian_contact/);

    // Email-only must be admitted (the whole point of item 4) — proves the CHECK
    // is "phone OR email", not still-secretly-requiring phone.
    await source.query(
      `INSERT INTO app.std_guardian (id, full_name, phone, email) VALUES ($1, 'Email Only', NULL, $2)`,
      [id, `email-only-${Date.now()}@example.com`],
    );
    try {
      const rows: Array<{ phone: string | null }> = await source.query(
        `SELECT phone FROM app.std_guardian WHERE id = $1`,
        [id],
      );
      expect(rows[0].phone).toBeNull();
    } finally {
      await source.query(`DELETE FROM app.std_guardian WHERE id = $1`, [id]);
    }
  }, 30_000);

  it("uq_std_guardian_phone_p (migration 0200) allows multiple NULL-phone guardians but rejects a duplicate real phone", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[students.integration.spec] SKIPPED (no DB) — uq_std_guardian_phone_p partial-unique check");
      return;
    }
    const source = dataSource;
    const idA = generateUuidV7();
    const idB = generateUuidV7();
    const idC = generateUuidV7();
    const suffix = Date.now();
    const sharedPhone = `+254700${suffix}`.slice(0, 20);

    try {
      // Two NULL-phone (email-only) guardians must coexist without violating uniqueness.
      await source.query(
        `INSERT INTO app.std_guardian (id, full_name, phone, email) VALUES ($1, 'A', NULL, $2)`,
        [idA, `a-${suffix}@example.com`],
      );
      await source.query(
        `INSERT INTO app.std_guardian (id, full_name, phone, email) VALUES ($1, 'B', NULL, $2)`,
        [idB, `b-${suffix}@example.com`],
      );

      // A real phone value, then a second guardian reusing the SAME phone, must be rejected.
      await source.query(
        `INSERT INTO app.std_guardian (id, full_name, phone, email) VALUES ($1, 'C', $2, NULL)`,
        [idC, sharedPhone],
      );
      await expect(
        source.query(
          `INSERT INTO app.std_guardian (id, full_name, phone, email) VALUES ($1, 'D', $2, NULL)`,
          [generateUuidV7(), sharedPhone],
        ),
      ).rejects.toThrow(/uq_std_guardian_phone_p/);
    } finally {
      await source.query(`DELETE FROM app.std_guardian WHERE id IN ($1, $2, $3)`, [idA, idB, idC]);
    }
  }, 30_000);

  it("search_name generated column is lowercase first+middle+last, computed by Postgres", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[students.integration.spec] SKIPPED (no DB) — generated column check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();
    const classId = await insertClass(source, `GEN-COL-${suffix}`);
    const studentId = generateUuidV7();
    await source.query(
      `
      INSERT INTO app.std_student
        (id, admission_no, first_name, middle_name, last_name, class_id, status, boarding, custom_fields, enrolled_on, exit_cleared)
      VALUES ($1, $2, 'Mary', 'Wanjiku', 'Njoroge', $3, 'ACTIVE', 'DAY', '{}'::jsonb, CURRENT_DATE, false)
      `,
      [studentId, `ADM-GEN-${suffix}`, classId],
    );

    try {
      const rows: Array<{ search_name: string }> = await source.query(
        `SELECT search_name FROM app.std_student WHERE id = $1`,
        [studentId],
      );
      expect(rows[0].search_name).toBe("mary wanjiku njoroge");
    } finally {
      await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
      await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
    }
  }, 30_000);
});
