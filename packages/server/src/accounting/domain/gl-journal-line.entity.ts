import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../shared/database/base.entity";
import { Money } from "../../shared/money/money";
import { RequiredMoneyTransformer } from "../../shared/money/money.transformer";
import { GlAccountEntity } from "./gl-account.entity";
import { GlCostCenterEntity } from "./gl-cost-center.entity";
import { GlJournalEntity } from "./gl-journal.entity";

/**
 * Maps to `gl_journal_line` (docs/phase-4/02-schema-platform-accounting.md
 * §8) — immutable after insert (`trg_gl_journal_immutable`, migration
 * `0060`), the biggest table in the system (partition-ready by year per
 * `docs/phase-4/01-standards-and-migrations.md` §8 N-4/retention note).
 * `BaseEntity` (not `MutableBaseEntity`) — same rationale as `GlJournalEntity`.
 *
 * `CHECK ck_gl_journal_line_one_side` enforces "exactly one side, nonzero"
 * (`(debit = 0) <> (credit = 0)`); `CHECK ck_gl_journal_line_nonneg` blocks
 * negative amounts on either side (a credit-side reduction is posted as a
 * debit line, never a negative credit). `trg_gl_journal_balanced` (deferred
 * constraint trigger, migration `0060`) asserts `SUM(debit) = SUM(credit)`
 * per `journal_id` at COMMIT (BR-GEN-02) — this entity only carries the
 * per-line CHECKs; the cross-row balance invariant is DB-trigger-only.
 *
 * **Loose reference** (`entity_ref_type`/`entity_ref_id`) — see
 * `GlJournalEntity`'s "Loose references" doc comment: this is the
 * sub-ledger link (e.g. a specific `bill_invoice_line`, `pay_receipt`,
 * `pyrl_payslip`) and deliberately carries **no** FK, since it can point
 * into any domain module and accounting-core imports only the shared
 * kernel (`docs/phase-3/01-system-architecture.md §3.3 rule 2`).
 */
@Entity("gl_journal_line")
@Index("ix_gl_line_account_journal", ["accountId", "journalId"])
@Index("ix_gl_line_entity", ["entityRefType", "entityRefId"], {
  where: `"entity_ref_id" IS NOT NULL`,
})
@Check("ck_gl_journal_line_one_side", `("debit" = 0) <> ("credit" = 0)`)
@Check("ck_gl_journal_line_nonneg", `"debit" >= 0 AND "credit" >= 0`)
export class GlJournalLineEntity extends BaseEntity {
  @Column({ type: "uuid", name: "journal_id" })
  journalId!: string;

  @ManyToOne(() => GlJournalEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity;

  @Column({ type: "int", name: "line_no" })
  lineNo!: number;

  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "account_id" })
  account?: GlAccountEntity;

  @Column({ type: "uuid", name: "cost_center_id", nullable: true })
  costCenterId!: string | null;

  @ManyToOne(() => GlCostCenterEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cost_center_id" })
  costCenter?: GlCostCenterEntity | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "debit",
    transformer: RequiredMoneyTransformer,
  })
  debit!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "credit",
    transformer: RequiredMoneyTransformer,
  })
  credit!: Money;

  @Column({ type: "varchar", length: 200, name: "memo", nullable: true })
  memo!: string | null;

  /** Bare uuid/varchar, no FK — see `GlJournalEntity`'s "Loose references" doc comment. */
  @Column({ type: "varchar", length: 30, name: "entity_ref_type", nullable: true })
  entityRefType!: string | null;

  /** Bare uuid, no FK — see `GlJournalEntity`'s "Loose references" doc comment. */
  @Column({ type: "uuid", name: "entity_ref_id", nullable: true })
  entityRefId!: string | null;
}
