import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 16 (Part 1 — Document Security: Watermark + QR Verification
 * backend). `docv_record` — a fully generic, append-only mint log any
 * document-producing service can use to attach an opaque, unguessable
 * verification token to a document at creation/publish time
 * (`DocumentVerificationService.mint()`), later resolved back to a safe
 * summary by the public `GET /document-verification/:token` endpoint with no
 * auth (`.verify()`). See `DocvRecordEntity`'s own doc comment for the full
 * design rationale — loose `document_type`/`document_id` reference, no FK,
 * same convention `appr_instance.entity_type`/`.entity_id` and
 * `comm_message.entity_type`/`.entity_id` already establish for a generic
 * platform module that must stay decoupled from every domain module that
 * might ever call it.
 *
 * `token` carries a real unique constraint (`uq_docv_record_token`) —
 * `DocumentVerificationService.verify()`'s whole public, unauthenticated
 * lookup path depends on this being unique. `ix_docv_record_document` backs
 * `findByDocument(documentType, documentId)`'s lookup (used by the two
 * wired-in callers, `ReceiptsController`/`FeeStructuresController`, to
 * surface an already-minted token on their own "get by id" response without
 * denormalizing a new column onto `pay_receipt`/`bill_fee_structure`, both
 * immutable-once-posted financial entities per this codebase's own
 * established discipline).
 *
 * No per-table `GRANT` needed — `kfe_app` already gets `SELECT, INSERT,
 * UPDATE, DELETE` on every `app.*` table via migration `0002`'s `ALTER
 * DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA app`.
 */
export class CreateDocvRecord0237 implements MigrationInterface {
  name = "CreateDocvRecord1700000000237";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.docv_record (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        document_type varchar(60) NOT NULL,
        document_id uuid NOT NULL,
        document_ref varchar(120) NOT NULL,
        token varchar(64) NOT NULL,
        summary jsonb NOT NULL,
        CONSTRAINT uq_docv_record_token UNIQUE (token)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_docv_record_document ON app.docv_record (document_type, document_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.docv_record`);
  }
}
