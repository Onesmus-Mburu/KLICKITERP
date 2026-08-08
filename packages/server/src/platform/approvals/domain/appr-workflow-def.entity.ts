import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `appr_workflow_def` (docs/phase-4/02-schema-platform-accounting.md
 * §6). `domain_code` is an open string namespace, deliberately with no CHECK
 * constraint — any future module registers its own workflow by picking a
 * `domain_code` (e.g. `'BILLING_WAIVER'`, `'PAYMENT_VOUCHER'`,
 * `'PROCUREMENT_PO'`, `'PAYROLL_RUN'`, `'JOURNAL_ENTRY'`) and calling
 * `WorkflowDefinitionsService.create()` once; `ApprovalEngineService.submit()`
 * looks workflows up by this same string. See that service's doc comment for
 * the full documented list of codes in use so far.
 */
@Entity("appr_workflow_def")
@Index("uq_appr_workflow_def_domain_code", ["domainCode"], { unique: true })
export class ApprWorkflowDefEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "domain_code" })
  domainCode!: string;

  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}
