import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §2 (usr_*) +
 * docs/phase-4/01-standards-and-migrations.md §7.2 migration 0010.
 * This migration is the DDL source of truth alongside
 * `packages/server/src/platform/users/domain/*.entity.ts` — columns match
 * the entities 1:1.
 *
 * `usr_user` and `usr_department` reference each other (department_id,
 * head_user_id), so `usr_department` is created first without its FK to
 * `usr_user`, `usr_user` is created next (with its FK to `usr_department`),
 * and the `usr_department -> usr_user` FK is added last via ALTER TABLE.
 * `down()` reverses that: drop the ALTER-added FK before dropping `usr_user`.
 *
 * FK `ON DELETE` policy applied throughout (docs/phase-4/01-standards-and-migrations.md
 * §5 rule 1, "RESTRICT default"): required (NOT NULL) FKs use RESTRICT;
 * nullable single-reference FKs use SET NULL (the nullability itself signals
 * the reference may be cleared); pure join-table FKs (usr_user_role,
 * usr_role_permission — rows with no existence independent of both parents)
 * use CASCADE.
 */
export class CreateUsrTables0010 implements MigrationInterface {
  name = "CreateUsrTables1700000000010";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.usr_department (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        name varchar(80) NOT NULL,
        head_user_id uuid NULL,
        CONSTRAINT uq_usr_department_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_user (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        username varchar(60) NOT NULL,
        email varchar(160) NULL,
        phone varchar(20) NULL,
        password_hash varchar(72) NOT NULL,
        full_name varchar(120) NOT NULL,
        status varchar(20) NOT NULL,
        user_type varchar(20) NOT NULL DEFAULT 'STAFF',
        must_change_password boolean NOT NULL DEFAULT true,
        twofa_enabled boolean NOT NULL DEFAULT false,
        twofa_secret_enc bytea NULL,
        recovery_codes_enc bytea NULL,
        department_id uuid NULL,
        authority_limit_amount numeric(18,4) NULL,
        last_login_at timestamptz NULL,
        password_changed_at timestamptz NOT NULL DEFAULT now(),
        locale varchar(8) NOT NULL DEFAULT 'en',
        CONSTRAINT uq_usr_user_username UNIQUE (username),
        CONSTRAINT fk_usr_user_department_id FOREIGN KEY (department_id)
          REFERENCES app.usr_department(id) ON DELETE SET NULL,
        CONSTRAINT ck_usr_user_status CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','DEACTIVATED')),
        CONSTRAINT ck_usr_user_user_type CHECK (user_type IN ('STAFF','PARENT','SYSTEM')),
        CONSTRAINT ck_usr_user_contact_or_parent CHECK (
          user_type = 'PARENT' OR phone IS NOT NULL OR email IS NOT NULL
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_usr_user_email_p ON app.usr_user (email) WHERE email IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_usr_user_phone_p ON app.usr_user (phone) WHERE phone IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX ix_usr_user_department_id ON app.usr_user (department_id)
    `);

    await queryRunner.query(`
      ALTER TABLE app.usr_department
        ADD CONSTRAINT fk_usr_department_head_user_id FOREIGN KEY (head_user_id)
          REFERENCES app.usr_user(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_role (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        name varchar(60) NOT NULL,
        description text NULL,
        is_system_template boolean NOT NULL DEFAULT false,
        is_auditor_class boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_usr_role_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_permission (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        code varchar(80) NOT NULL,
        module varchar(30) NOT NULL,
        description text NULL,
        is_write boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_usr_permission_code UNIQUE (code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_user_role (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        user_id uuid NOT NULL,
        role_id uuid NOT NULL,
        CONSTRAINT fk_usr_user_role_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE CASCADE,
        CONSTRAINT fk_usr_user_role_role_id FOREIGN KEY (role_id)
          REFERENCES app.usr_role(id) ON DELETE CASCADE,
        CONSTRAINT uq_usr_user_role_user_id_role_id UNIQUE (user_id, role_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_role_permission (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        role_id uuid NOT NULL,
        permission_id uuid NOT NULL,
        CONSTRAINT fk_usr_role_permission_role_id FOREIGN KEY (role_id)
          REFERENCES app.usr_role(id) ON DELETE CASCADE,
        CONSTRAINT fk_usr_role_permission_permission_id FOREIGN KEY (permission_id)
          REFERENCES app.usr_permission(id) ON DELETE CASCADE,
        CONSTRAINT uq_usr_role_permission_role_id_permission_id UNIQUE (role_id, permission_id)
      )
    `);

    // BR-SEC-04: reject INSERT/UPDATE pairing an is_write permission with an is_auditor_class role.
    await queryRunner.query(`
      CREATE FUNCTION app.fn_auditor_no_write() RETURNS trigger AS $$
      DECLARE
        v_is_auditor boolean;
        v_is_write boolean;
      BEGIN
        SELECT is_auditor_class INTO v_is_auditor FROM app.usr_role WHERE id = NEW.role_id;
        SELECT is_write INTO v_is_write FROM app.usr_permission WHERE id = NEW.permission_id;
        IF v_is_auditor AND v_is_write THEN
          RAISE EXCEPTION 'BR-SEC-04: role % is auditor-class and cannot be granted write permission %',
            NEW.role_id, NEW.permission_id
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_auditor_no_write
        BEFORE INSERT OR UPDATE ON app.usr_role_permission
        FOR EACH ROW EXECUTE FUNCTION app.fn_auditor_no_write()
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_sod_rule (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        permission_a uuid NOT NULL,
        permission_b uuid NOT NULL,
        is_enabled boolean NOT NULL DEFAULT true,
        CONSTRAINT fk_usr_sod_rule_permission_a FOREIGN KEY (permission_a)
          REFERENCES app.usr_permission(id) ON DELETE RESTRICT,
        CONSTRAINT fk_usr_sod_rule_permission_b FOREIGN KEY (permission_b)
          REFERENCES app.usr_permission(id) ON DELETE RESTRICT,
        CONSTRAINT uq_usr_sod_rule_permission_a_permission_b UNIQUE (permission_a, permission_b)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_session (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        user_id uuid NOT NULL,
        refresh_token_hash varchar(64) NOT NULL,
        family_id uuid NOT NULL,
        device varchar(160) NOT NULL,
        ip inet NOT NULL,
        user_agent text NOT NULL,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz NULL,
        revoke_reason varchar(30) NULL,
        CONSTRAINT fk_usr_session_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT uq_usr_session_refresh_token_hash UNIQUE (refresh_token_hash)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_usr_session_user_id ON app.usr_session (user_id)`);
    await queryRunner.query(`CREATE INDEX ix_usr_session_family_id ON app.usr_session (family_id)`);

    await queryRunner.query(`
      CREATE TABLE app.usr_login_event (
        id uuid PRIMARY KEY,
        user_id uuid NULL,
        username_attempted varchar(60) NOT NULL,
        success boolean NOT NULL,
        failure_reason varchar(30) NULL,
        ip inet NOT NULL,
        device_fp varchar(64) NOT NULL,
        at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_usr_login_event_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_usr_login_event_user_at ON app.usr_login_event (user_id, at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_usr_login_event_at_brin ON app.usr_login_event USING BRIN (at)
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_password_history (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        password_hash varchar(72) NOT NULL,
        at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_usr_password_history_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_usr_password_history_user_id_at ON app.usr_password_history (user_id, at)
    `);

    await queryRunner.query(`
      CREATE TABLE app.usr_api_key (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        name varchar(80) NOT NULL,
        key_hash varchar(64) NOT NULL,
        prefix varchar(12) NOT NULL,
        scopes jsonb NOT NULL,
        expires_at timestamptz NULL,
        ip_allowlist inet[] NULL,
        last_used_at timestamptz NULL,
        revoked_at timestamptz NULL,
        owner_user_id uuid NOT NULL,
        CONSTRAINT fk_usr_api_key_owner_user_id FOREIGN KEY (owner_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT uq_usr_api_key_key_hash UNIQUE (key_hash)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_api_key`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_password_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_login_event`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_session`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_sod_rule`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_auditor_no_write ON app.usr_role_permission`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_auditor_no_write()`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_role_permission`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_user_role`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_permission`);

    await queryRunner.query(`
      ALTER TABLE app.usr_department DROP CONSTRAINT IF EXISTS fk_usr_department_head_user_id
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_role`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.usr_department`);
  }
}
