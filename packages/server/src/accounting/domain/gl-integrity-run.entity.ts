import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../shared/database/base.entity";

/**
 * Maps to `gl_integrity_run` (docs/phase-4/02-schema-platform-accounting.md
 * §8) — the NFR-INT-002 sweep log (re-derives `gl_period_account_total`
 * from `SUM(gl_journal_line)` hourly and records the outcome). `BaseEntity`
 * (not `MutableBaseEntity`) — a documented judgement call: each row is a
 * single completed sweep result, written once and never edited, the same
 * append-only shape as `appr_action`/`usr_login_event`, not a config row
 * needing optimistic locking.
 */
@Entity("gl_integrity_run")
export class GlIntegrityRunEntity extends BaseEntity {
  @Column({ type: "timestamptz", name: "ran_at" })
  ranAt!: Date;

  @Column({ type: "varchar", length: 20, name: "kind" })
  kind!: string;

  @Column({ type: "boolean", name: "ok" })
  ok!: boolean;

  @Column({ type: "jsonb", name: "findings" })
  findings!: Record<string, unknown>;
}
