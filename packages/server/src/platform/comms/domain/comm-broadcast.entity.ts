import { Check, Column, Entity } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { CommChannel } from "./comm-template.entity";

export type CommBroadcastStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENDING" | "SENT" | "CANCELLED";

/**
 * Maps to `comm_broadcast` (docs/phase-4/02-schema-platform-accounting.md
 * §5). `audience_def` is opaque jsonb here — `BroadcastsService.send()`
 * currently only understands two shapes (`{"kind":"STAFF_ROLE","roleId":...}`
 * / `{"kind":"EXPLICIT_USER_IDS","userIds":[...]}`); guardian/parent
 * audience kinds are deferred to Module 8 (Students), which doesn't exist
 * yet — see that service's doc comment.
 *
 * `approval_ref` is a bare uuid with no FK — the real `appr_*` approval
 * workflow engine is Module 6 (Approvals), not built yet;
 * `BroadcastsService.submitForApproval()` only stores/requires the caller-
 * supplied reference, it does not validate or resolve it against anything.
 */
@Entity("comm_broadcast")
@Check(
  "ck_comm_broadcast_status",
  `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENDING','SENT','CANCELLED')`,
)
@Check("ck_comm_broadcast_channel", `"channel" IN ('SMS','EMAIL','PUSH','WHATSAPP','INAPP')`)
export class CommBroadcastEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "title" })
  title!: string;

  @Column({ type: "jsonb", name: "audience_def" })
  audienceDef!: unknown;

  @Column({ type: "varchar", length: 10, name: "channel" })
  channel!: CommChannel;

  @Column({ type: "text", name: "body" })
  body!: string;

  @Column({ type: "int", name: "recipient_count", default: 0 })
  recipientCount!: number;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "est_cost_amount",
    transformer: RequiredMoneyTransformer,
  })
  estCostAmount!: Money;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: CommBroadcastStatus;

  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;
}
