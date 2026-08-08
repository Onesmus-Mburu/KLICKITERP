import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { FileObjectEntity } from "../../../platform/files";

/**
 * Maps to `bill_sponsor` (docs/phase-4/03-schema-student-finance.md §3) — an
 * external sponsoring organization (NGO, CDF, corporate sponsor, ...).
 * `MutableBaseEntity` — ordinary mutable config.
 *
 * `agreement_file_id` is a real FK to `file_object` (`platform/files`,
 * imported via its public barrel), nullable `SET NULL` — a deleted agreement
 * document shouldn't block deleting the file row. `allows_cash_conversion`
 * gates BR-BILL-13 ("unused award balance never converts to student cash
 * credit unless the sponsor agreement flag permits") — read by the next
 * pass's sponsor-allocation service, opaque here.
 *
 * `std_student.sponsor_id` (Module 8) FKs here — this table closes that
 * Module 8 forward-reference gap (migration `0071`, see this pass's report).
 */
@Entity("bill_sponsor")
@Index("uq_bill_sponsor_name", ["name"], { unique: true })
export class BillSponsorEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "jsonb", name: "contacts", default: {} })
  contacts!: Record<string, unknown>;

  @Column({ type: "uuid", name: "agreement_file_id", nullable: true })
  agreementFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "agreement_file_id" })
  agreementFile?: FileObjectEntity | null;

  /** BR-BILL-13 — gates whether unused award balance may ever convert to student cash credit. */
  @Column({ type: "boolean", name: "allows_cash_conversion", default: false })
  allowsCashConversion!: boolean;
}
