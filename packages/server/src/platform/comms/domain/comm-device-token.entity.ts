import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../users";

/**
 * Common values for `platform` — not enforced as a DB CHECK because the DDL
 * (docs/phase-4/02-schema-platform-accounting.md §5) doesn't declare one for
 * this column (unlike `channel`/`status` elsewhere in this module, which do
 * have an explicit `CK(...)`); validated at the DTO layer only
 * (`api/dto/register-device-token.dto.ts`).
 */
export type CommDevicePlatform = "IOS" | "ANDROID" | "WEB";

/**
 * Maps to `comm_device_token` (docs/phase-4/02-schema-platform-accounting.md
 * §5) — one row per registered push token, `user_id` FK to `usr_user`
 * (RESTRICT, imported via `platform/users`' public barrel — same
 * one-directional-dependency precedent as `platform/auth`/`platform/files`,
 * see module-deps.json's `platform/comms` entry). `DeviceTokensService`
 * upserts by the unique `token` column (register = create-or-touch
 * `last_seen_at`), so a user re-registering the same physical device/token
 * never creates a duplicate row.
 */
@Entity("comm_device_token")
@Index("uq_comm_device_token_token", ["token"], { unique: true })
@Index("ix_comm_device_token_user_id", ["userId"])
export class CommDeviceTokenEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user?: UsrUserEntity;

  @Column({ type: "varchar", length: 300, name: "token" })
  token!: string;

  @Column({ type: "varchar", length: 10, name: "platform" })
  platform!: CommDevicePlatform;

  @Column({ type: "timestamptz", name: "last_seen_at" })
  lastSeenAt!: Date;
}
