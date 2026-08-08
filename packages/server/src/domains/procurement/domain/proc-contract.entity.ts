import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { FileObjectEntity } from "../../../platform/files";
import { ProcSupplierEntity } from "./proc-supplier.entity";

/**
 * `proc_contract.status` has no CHECK enum specified in the source DDL
 * (docs/phase-4/04-schema-operations.md §2 names only the columns, leaving
 * `status` bare) — a documented judgement call per the task brief:
 * `ACTIVE|EXPIRED|TERMINATED`. `ACTIVE` covers a contract currently in
 * force; `EXPIRED` is the natural end-of-term outcome (renewal-alert-driven,
 * FR-PROC's `renewal_alert_days`); `TERMINATED` covers an early, deliberate
 * end (breach, mutual agreement) distinct from a natural expiry — a
 * meaningful business distinction the next pass's reporting/renewal-alert
 * logic can rely on.
 */
export type ProcContractStatus = "ACTIVE" | "EXPIRED" | "TERMINATED";
export const PROC_CONTRACT_STATUSES: readonly ProcContractStatus[] = ["ACTIVE", "EXPIRED", "TERMINATED"];

/**
 * Maps to `proc_contract` (docs/phase-4/04-schema-operations.md §2) — a
 * supplier contract/agreement. Module 12 (Procurement) **foundation pass
 * only**.
 *
 * `MutableBaseEntity` — real post-creation update path: `status` progresses
 * ACTIVE->EXPIRED/TERMINATED (see the `ProcContractStatus` doc comment for
 * the enum's own judgement call).
 *
 * `document_file_id` is a real FK to `file_object` (`platform/files`, via
 * its public barrel), nullable `SET NULL`. `value` is nullable `Money`
 * (`MoneyTransformer`, not `RequiredMoneyTransformer`) per the DDL's own
 * explicit `value NUMERIC(18,4) NULL` — not every contract carries a fixed
 * monetary value (e.g. an open-ended framework agreement).
 *
 * `renewal_alert_days` defaults to `30` — a documented judgement call (the
 * DDL names the column with no default), mirroring `proc_supplier.
 * payment_terms_days`'s own `DEFAULT 30` for a similarly-shaped "days ahead
 * of an event" configuration column.
 */
@Entity("proc_contract")
@Check("ck_proc_contract_status", `"status" IN ('ACTIVE','EXPIRED','TERMINATED')`)
@Check("ck_proc_contract_dates", `"ends_on" >= "starts_on"`)
export class ProcContractEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "supplier_id" })
  supplierId!: string;

  @ManyToOne(() => ProcSupplierEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplier_id" })
  supplier?: ProcSupplierEntity;

  @Column({ type: "varchar", length: 160, name: "title" })
  title!: string;

  @Column({ type: "date", name: "starts_on" })
  startsOn!: string;

  @Column({ type: "date", name: "ends_on" })
  endsOn!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "value",
    nullable: true,
    transformer: MoneyTransformer,
  })
  value!: Money | null;

  @Column({ type: "int", name: "renewal_alert_days", default: 30 })
  renewalAlertDays!: number;

  @Column({ type: "uuid", name: "document_file_id", nullable: true })
  documentFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "document_file_id" })
  documentFile?: FileObjectEntity | null;

  @Column({ type: "varchar", length: 12, name: "status" })
  status!: ProcContractStatus;
}
