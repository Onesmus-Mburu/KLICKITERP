import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../users/domain/usr-user.entity";

/**
 * Maps to `appr_delegation` (docs/phase-4/02-schema-platform-accounting.md
 * §6) — FR-APPR-005.1 "user sets delegate + date range (cannot delegate to
 * the request's initiator)". The DB `CHECK (from_user_id <> to_user_id)`
 * only rules out delegating to *yourself*; delegating to a request's own
 * initiator is prevented in `ApprovalEngineService.decide()` (the
 * self-approval check runs against the *resolved* actor either way — see
 * that service's doc comment), not by a constraint on this table, since
 * `appr_delegation` has no knowledge of any particular `appr_instance`.
 */
@Entity("appr_delegation")
@Index("ix_appr_delegation_from_user_dates", ["fromUserId", "startsOn", "endsOn"])
@Check("ck_appr_delegation_from_ne_to", `"from_user_id" <> "to_user_id"`)
export class ApprDelegationEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "from_user_id" })
  fromUserId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "from_user_id" })
  fromUser?: UsrUserEntity;

  @Column({ type: "uuid", name: "to_user_id" })
  toUserId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "to_user_id" })
  toUser?: UsrUserEntity;

  @Column({ type: "date", name: "starts_on" })
  startsOn!: string;

  @Column({ type: "date", name: "ends_on" })
  endsOn!: string;

  @Column({ type: "text", name: "reason", nullable: true })
  reason!: string | null;
}
