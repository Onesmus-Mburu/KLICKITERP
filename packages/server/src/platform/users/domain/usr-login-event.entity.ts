import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { UsrUserEntity } from "./usr-user.entity";

/**
 * Append-only, no std-update (docs/phase-4/02-schema-platform-accounting.md
 * §2 explicitly notes this exception) — a login attempt row is never edited
 * after insert, so it does not extend BaseEntity (which carries updated_at/
 * updated_by that this table has no use for).
 */
@Entity("usr_login_event")
@Index("ix_usr_login_event_user_at", ["userId", "at"])
export class UsrLoginEventEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid", name: "user_id", nullable: true })
  userId!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user?: UsrUserEntity | null;

  @Column({ type: "varchar", length: 60, name: "username_attempted" })
  usernameAttempted!: string;

  @Column({ type: "boolean", name: "success" })
  success!: boolean;

  @Column({ type: "varchar", length: 30, name: "failure_reason", nullable: true })
  failureReason!: string | null;

  @Column({ type: "inet", name: "ip" })
  ip!: string;

  @Column({ type: "varchar", length: 64, name: "device_fp" })
  deviceFp!: string;

  @Column({ type: "timestamptz", name: "at", default: () => "now()" })
  at!: Date;

  @BeforeInsert()
  assignId(): void {
    if (!this.id) {
      this.id = generateUuidV7();
    }
  }
}
