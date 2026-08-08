import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { UsrUserEntity } from "./usr-user.entity";

@Entity("usr_session")
@Index("uq_usr_session_refresh_token_hash", ["refreshTokenHash"], { unique: true })
@Index("ix_usr_session_user_id", ["userId"])
@Index("ix_usr_session_family_id", ["familyId"])
export class UsrSessionEntity extends BaseEntity {
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user!: UsrUserEntity;

  @Column({ type: "varchar", length: 64, name: "refresh_token_hash" })
  refreshTokenHash!: string;

  /** Groups all tokens descending from one login; reuse of a rotated token revokes the whole family. */
  @Column({ type: "uuid", name: "family_id" })
  familyId!: string;

  @Column({ type: "varchar", length: 160, name: "device" })
  device!: string;

  @Column({ type: "inet", name: "ip" })
  ip!: string;

  @Column({ type: "text", name: "user_agent" })
  userAgent!: string;

  @Column({ type: "timestamptz", name: "last_seen_at", default: () => "now()" })
  lastSeenAt!: Date;

  @Column({ type: "timestamptz", name: "revoked_at", nullable: true })
  revokedAt!: Date | null;

  @Column({ type: "varchar", length: 30, name: "revoke_reason", nullable: true })
  revokeReason!: string | null;
}
