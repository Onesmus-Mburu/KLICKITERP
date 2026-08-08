import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer, RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrDepartmentEntity } from "../../users/domain/usr-department.entity";
import { ApprWorkflowVersionEntity } from "./appr-workflow-version.entity";

/**
 * Maps to `appr_routing_rule` (docs/phase-4/02-schema-platform-accounting.md
 * §6). `ApprovalEngineService.submit()` matches an instance's `amount`
 * against `[min_amount, max_amount)` (an unset `max_amount` means "no upper
 * bound") and, when `department_id` is set on the rule, additionally
 * requires the initiating user's `department_id` to equal it — see that
 * service's doc comment for the full matching algorithm and why department
 * is derived from the initiator rather than taken as a `submit()` parameter.
 * `level_subset` (nullable `int[]` of `appr_level.seq` values) selects which
 * levels apply when this rule matches; `NULL` means "all levels of the
 * workflow version".
 */
@Entity("appr_routing_rule")
export class ApprRoutingRuleEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "workflow_version_id" })
  workflowVersionId!: string;

  @ManyToOne(() => ApprWorkflowVersionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workflow_version_id" })
  workflowVersion?: ApprWorkflowVersionEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "min_amount",
    transformer: RequiredMoneyTransformer,
  })
  minAmount!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "max_amount",
    nullable: true,
    transformer: MoneyTransformer,
  })
  maxAmount!: Money | null;

  @Column({ type: "int", name: "level_subset", array: true, nullable: true })
  levelSubset!: number[] | null;

  @Column({ type: "uuid", name: "department_id", nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => UsrDepartmentEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "department_id" })
  department?: UsrDepartmentEntity | null;
}
