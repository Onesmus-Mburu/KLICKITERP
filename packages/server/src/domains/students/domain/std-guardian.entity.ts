import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";

/**
 * Maps to `std_guardian` (docs/phase-4/03-schema-student-finance.md §2) — a
 * parent/guardian record, optionally linked to a portal `usr_user` account
 * (`user_id`, nullable — most guardians never log in). Imported via
 * `platform/users`' public barrel only, per `module-deps.json`'s `domains/students`
 * entry and `crossSiblingImportPolicy`. `payout_verified` is an opaque jsonb
 * bag targeted by BR-WALL-06 (Wallet/Module 11, not built yet) — carried here
 * unread by this module, same "config exists, consumer doesn't yet" pattern
 * as other forward-dependency columns throughout this build.
 *
 * **Phase 6 Slice 2b, item 4**: `phone` is now optional — a guardian may be
 * created with only an email. Mirrors `usr_user`'s own
 * `ck_usr_user_contact_or_parent` + `uq_usr_user_phone_p` pattern exactly
 * (migration `0200`): `uq_std_guardian_phone_p` is a partial unique index
 * (`WHERE phone IS NOT NULL`) instead of a full-table UNIQUE, and
 * `ck_std_guardian_contact` requires phone OR email — DB-layer
 * defense-in-depth for `GuardiansService.create()`'s matching
 * application-layer check.
 */
@Entity("std_guardian")
@Index("uq_std_guardian_phone_p", ["phone"], { unique: true, where: '"phone" IS NOT NULL' })
@Check("ck_std_guardian_contact", `"phone" IS NOT NULL OR "email" IS NOT NULL`)
export class StdGuardianEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "full_name" })
  fullName!: string;

  @Column({ type: "varchar", length: 20, name: "phone", nullable: true })
  phone!: string | null;

  @Column({ type: "varchar", length: 160, name: "email", nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 20, name: "national_id", nullable: true })
  nationalId!: string | null;

  @Column({ type: "uuid", name: "user_id", nullable: true })
  userId!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user?: UsrUserEntity | null;

  /** BR-WALL-06 targets (Wallet/Module 11) — opaque jsonb, not yet read by anything in this module. */
  @Column({ type: "jsonb", name: "payout_verified", nullable: true })
  payoutVerified!: Record<string, unknown> | null;
}
