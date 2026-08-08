import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { UsrPermissionEntity } from "./usr-permission.entity";
import { UsrRoleEntity } from "./usr-role.entity";

/**
 * Pure join row — CASCADE on both sides. `trg_auditor_no_write` (migration
 * 0010) rejects INSERTs pairing an `is_write=true` permission with an
 * `is_auditor_class` role (BR-SEC-04), enforced at the DB as defense in
 * depth alongside the service-layer check the next pass builds.
 */
@Entity("usr_role_permission")
@Index("uq_usr_role_permission_role_id_permission_id", ["roleId", "permissionId"], { unique: true })
export class UsrRolePermissionEntity extends BaseEntity {
  @Column({ type: "uuid", name: "role_id" })
  roleId!: string;

  @ManyToOne(() => UsrRoleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role!: UsrRoleEntity;

  @Column({ type: "uuid", name: "permission_id" })
  permissionId!: string;

  @ManyToOne(() => UsrPermissionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "permission_id" })
  permission!: UsrPermissionEntity;
}
