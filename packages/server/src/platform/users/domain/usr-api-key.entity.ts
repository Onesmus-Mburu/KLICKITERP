import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { UsrUserEntity } from "./usr-user.entity";

@Entity("usr_api_key")
@Index("uq_usr_api_key_key_hash", ["keyHash"], { unique: true })
export class UsrApiKeyEntity extends BaseEntity {
  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 64, name: "key_hash" })
  keyHash!: string;

  @Column({ type: "varchar", length: 12, name: "prefix" })
  prefix!: string;

  @Column({ type: "jsonb", name: "scopes" })
  scopes!: string[];

  @Column({ type: "timestamptz", name: "expires_at", nullable: true })
  expiresAt!: Date | null;

  @Column({ type: "inet", name: "ip_allowlist", array: true, nullable: true })
  ipAllowlist!: string[] | null;

  @Column({ type: "timestamptz", name: "last_used_at", nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: "timestamptz", name: "revoked_at", nullable: true })
  revokedAt!: Date | null;

  @Column({ type: "uuid", name: "owner_user_id" })
  ownerUserId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "owner_user_id" })
  ownerUser!: UsrUserEntity;
}
