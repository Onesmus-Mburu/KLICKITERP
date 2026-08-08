import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { UsrUserEntity } from "./usr-user.entity";

/** Append-only — a password hash is never edited after insert, only superseded by a new row. */
@Entity("usr_password_history")
@Index("ix_usr_password_history_user_id_at", ["userId", "at"])
export class UsrPasswordHistoryEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user!: UsrUserEntity;

  @Column({ type: "varchar", length: 72, name: "password_hash" })
  passwordHash!: string;

  @Column({ type: "timestamptz", name: "at", default: () => "now()" })
  at!: Date;

  @BeforeInsert()
  assignId(): void {
    if (!this.id) {
      this.id = generateUuidV7();
    }
  }
}
