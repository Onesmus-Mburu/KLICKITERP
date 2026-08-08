import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { UsrPermissionEntity } from "./usr-permission.entity";

/** BR-SEC-01 — pairs of permissions that must never be held together by one role/user. */
@Entity("usr_sod_rule")
@Index("uq_usr_sod_rule_permission_a_permission_b", ["permissionAId", "permissionBId"], {
  unique: true,
})
export class UsrSodRuleEntity extends BaseEntity {
  @Column({ type: "uuid", name: "permission_a" })
  permissionAId!: string;

  @ManyToOne(() => UsrPermissionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "permission_a" })
  permissionA!: UsrPermissionEntity;

  @Column({ type: "uuid", name: "permission_b" })
  permissionBId!: string;

  @ManyToOne(() => UsrPermissionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "permission_b" })
  permissionB!: UsrPermissionEntity;

  @Column({ type: "boolean", name: "is_enabled", default: true })
  isEnabled!: boolean;
}
