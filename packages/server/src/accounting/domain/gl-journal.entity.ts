import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../shared/database/base.entity";
import { GlPeriodEntity } from "./gl-period.entity";

export type GlJournalType = "SYSTEM" | "MANUAL" | "REVERSING" | "CLOSING" | "OPENING";
export const GL_JOURNAL_TYPES: readonly GlJournalType[] = [
  "SYSTEM",
  "MANUAL",
  "REVERSING",
  "CLOSING",
  "OPENING",
];

/**
 * Maps to `gl_journal` (docs/phase-4/02-schema-platform-accounting.md §8) —
 * immutable after insert (`trg_gl_journal_immutable`, migration `0060`).
 * `BaseEntity` (not `MutableBaseEntity`) per the task brief: this table
 * still carries `created_at`/`created_by` (DR-007) but has no meaningful
 * UPDATE path — reversals are new journals (`reversal_of_id` points back at
 * what they reverse), never edits, so no optimistic-lock column is needed.
 * Same treatment as `appr_action`/`comm_message` (append-only precedent).
 *
 * **Loose references — architectural note (see also `GlJournalLineEntity`,
 * `docs/phase-3/01-system-architecture.md §3.3 rule 2 "accounting core
 * imports only shared kernel")**: `posted_by` (would-be FK to
 * `platform/users.usr_user`) and `approval_ref` (would-be FK to
 * `platform/approvals.appr_instance`) are deliberately plain `uuid` columns
 * with **no** `@ManyToOne` relation and **no** DB FK constraint — the same
 * "sub-ledger link" pattern the DDL itself uses for
 * `gl_journal_line.entity_ref_id`. This keeps `accounting`'s
 * `module-deps.json` entry at `mayImport: ["shared"]`. `source_doc_id` is
 * likewise a bare `uuid` — it can point at a row in *any* domain module
 * (billing, payments, payroll, ...), so a real FK is not even meaningful,
 * let alone permitted. Only FKs *within* the `gl_*` table group itself
 * (here: `period_id -> gl_period`, `reversal_of_id -> gl_journal`) get a
 * real `@ManyToOne`.
 */
@Entity("gl_journal")
@Index("uq_gl_journal_number", ["number"], { unique: true })
@Index("ix_gl_journal_source", ["sourceDocType", "sourceDocId"])
@Index("ix_gl_journal_period_id", ["periodId"])
@Index("ix_gl_journal_date", ["journalDate"])
@Check("ck_gl_journal_type", `"journal_type" IN ('SYSTEM','MANUAL','REVERSING','CLOSING','OPENING')`)
export class GlJournalEntity extends BaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "date", name: "journal_date" })
  journalDate!: string;

  @Column({ type: "uuid", name: "period_id" })
  periodId!: string;

  @ManyToOne(() => GlPeriodEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "period_id" })
  period?: GlPeriodEntity;

  @Column({ type: "varchar", length: 20, name: "source_module" })
  sourceModule!: string;

  @Column({ type: "varchar", length: 30, name: "source_doc_type" })
  sourceDocType!: string;

  /** Bare uuid, no FK — points at a row in whichever domain module posted this journal. */
  @Column({ type: "uuid", name: "source_doc_id" })
  sourceDocId!: string;

  @Column({ type: "text", name: "narration" })
  narration!: string;

  @Column({ type: "varchar", length: 15, name: "journal_type" })
  journalType!: GlJournalType;

  @Column({ type: "uuid", name: "reversal_of_id", nullable: true })
  reversalOfId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "reversal_of_id" })
  reversalOf?: GlJournalEntity | null;

  /** Bare uuid, no FK — see class-level doc comment ("Loose references"). */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  /** Bare uuid, no FK — see class-level doc comment ("Loose references"). */
  @Column({ type: "uuid", name: "posted_by" })
  postedBy!: string;

  @Column({ type: "timestamptz", name: "posted_at" })
  postedAt!: Date;
}
