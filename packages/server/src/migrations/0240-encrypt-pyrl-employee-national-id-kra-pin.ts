import { MigrationInterface, QueryRunner } from "typeorm";
import { decryptFromBuffer, encryptToBuffer } from "../shared/crypto/aes-gcm.util";

/** Mirrors `AppConfigService.appEncryptionKeyBase64`'s exact fallback — migrations run outside the Nest DI container, so this reads `process.env` directly, same as `data-source.ts` already does for DB credentials (both sourced from the same `.env` the migration runner loads). Must stay byte-for-byte identical to the app's own default or a value encrypted here (dev, no `APP_ENCRYPTION_KEY` set) would be undecryptable by the running app. */
const DEV_ENCRYPTION_KEY_BASE64 = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function encryptionKey(): string {
  return process.env.APP_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY_BASE64;
}

/** Byte-for-byte the same envelope shape `EmployeesService.encodeField()`/`.decodeField()` use (`payDetails`/`bankName`/`branch`/`account`'s own established pattern) — `JSON.stringify` before encrypting, `JSON.parse` after decrypting, so the running app's own `decodeField()` can read what this migration writes, and vice versa for `down()`. */
function encodeField(value: string): string {
  return encryptToBuffer(JSON.stringify(value), encryptionKey()).toString("base64");
}

function decodeField(stored: string): string {
  return JSON.parse(decryptFromBuffer(Buffer.from(stored, "base64"), encryptionKey())) as string;
}

/**
 * Real PII gap found during a Payroll frontend pass (Phase 6 Slice 22 Part
 * 1) and left deliberately unfixed at the time, per explicit user
 * instruction to revisit later: `pyrl_employee.national_id`/`.kra_pin` were
 * created as plain `varchar` columns by migration `0130` — NOT the `jsonb`
 * "(enc)" shape `pay_details`/`bank_name`/`branch`/`account` on the SAME
 * table genuinely use (`EmployeesService.encodeField()`/`.decodeField()`,
 * AES-256-GCM via `shared/crypto/aes-gcm.util.ts`). Confirmed live via
 * `psql`: both columns held real plaintext (a Kenyan national ID number and
 * KRA PIN) for every employee in this dev database, and
 * `EmployeesService.redact()` never touched either field — both were
 * visible unmasked to anyone with just `payroll:employee:view`.
 *
 * **This migration closes that gap the same way the other 4 fields already
 * work**: widens both columns to `jsonb` and re-encrypts every existing
 * plaintext value in place (this dev database has exactly 4 employee rows,
 * captured and individually re-encrypted below — trivial at this scale, and
 * the loop is correct at any scale since each row's ciphertext depends only
 * on its own plaintext, not on ordering or a bulk transform). Unlike
 * `pay_details`/`bank_name`/`branch`/`account` (genuinely optional,
 * `nullable: true`), `national_id`/`kra_pin` stay `NOT NULL` — they're
 * still mandatory business fields, only their AT-REST representation
 * changes. The service/entity/DTO changes that make `create()`/`redact()`/
 * `getDecrypted()` treat these two fields exactly like the other 4 land in
 * the same pass as this migration (`pyrl-employee.entity.ts`,
 * `employees.service.ts`) — this migration alone does not change any
 * running application behavior by itself except the storage format, which
 * is why capturing plaintext BEFORE the `ALTER COLUMN` and writing
 * ciphertext back in the same pass (never leaving a partially-migrated
 * state visible to a concurrent reader) matters.
 */
export class EncryptPyrlEmployeeNationalIdKraPin0240 implements MigrationInterface {
  name = "EncryptPyrlEmployeeNationalIdKraPin1700000000240";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ id: string; national_id: string; kra_pin: string }> = await queryRunner.query(
      `SELECT id, national_id, kra_pin FROM app.pyrl_employee`,
    );

    // `to_jsonb(...)` wraps each existing plaintext varchar value as a JSON
    // string in the new jsonb column — a real, lossless, reversible
    // intermediate state (NOT yet encrypted) — before the loop below
    // overwrites every row with its real ciphertext. Never a bare
    // placeholder value that would (even momentarily) violate `NOT NULL`.
    await queryRunner.query(`ALTER TABLE app.pyrl_employee ALTER COLUMN national_id TYPE jsonb USING to_jsonb(national_id)`);
    await queryRunner.query(`ALTER TABLE app.pyrl_employee ALTER COLUMN kra_pin TYPE jsonb USING to_jsonb(kra_pin)`);

    for (const row of rows) {
      await queryRunner.query(`UPDATE app.pyrl_employee SET national_id = $1::jsonb, kra_pin = $2::jsonb WHERE id = $3`, [
        JSON.stringify(encodeField(row.national_id)),
        JSON.stringify(encodeField(row.kra_pin)),
        row.id,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // `node-postgres` already deserializes a `jsonb` column into its real JS
    // value (a string here, since `up()` only ever stores a JSON string) —
    // `row.national_id`/`row.kra_pin` below are the real base64 ciphertext
    // strings directly, no extra `JSON.parse` needed on this side.
    const rows: Array<{ id: string; national_id: string; kra_pin: string }> = await queryRunner.query(
      `SELECT id, national_id, kra_pin FROM app.pyrl_employee`,
    );

    for (const row of rows) {
      await queryRunner.query(`UPDATE app.pyrl_employee SET national_id = $1::jsonb, kra_pin = $2::jsonb WHERE id = $3`, [
        JSON.stringify(decodeField(row.national_id)),
        JSON.stringify(decodeField(row.kra_pin)),
        row.id,
      ]);
    }

    // Every row's jsonb value is real decrypted plaintext (written above)
    // by the time these run — `#>> '{}'` extracts the JSON string as plain
    // text, restoring the exact original `varchar` shape migration `0130`
    // created. Safe to re-narrow: nothing since `0130` could have lengthened
    // a value already proven to fit `varchar(20)`/`varchar(15)`.
    await queryRunner.query(`ALTER TABLE app.pyrl_employee ALTER COLUMN national_id TYPE varchar(20) USING (national_id #>> '{}')`);
    await queryRunner.query(`ALTER TABLE app.pyrl_employee ALTER COLUMN kra_pin TYPE varchar(15) USING (kra_pin #>> '{}')`);
  }
}
