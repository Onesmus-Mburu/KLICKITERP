import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `set_setting` (docs/phase-4/02-schema-platform-accounting.md §4).
 * `value` is opaque jsonb from this entity's point of view — when
 * `isSecret` is true, the payload stored inside `value` is an
 * AES-256-GCM-encrypted envelope (base64 ciphertext, so it fits jsonb);
 * encryption/decryption happens in `SettingsService`, never here or in the
 * repository, per FR-SET-003.1's "secrets stored AES-256-GCM encrypted
 * inside value" note.
 */
@Entity("set_setting")
@Index("uq_set_setting_key", ["key"], { unique: true })
export class SetSettingEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 80, name: "key" })
  key!: string;

  @Column({ type: "jsonb", name: "value" })
  value!: unknown;

  @Column({ type: "boolean", name: "is_secret", default: false })
  isSecret!: boolean;
}
