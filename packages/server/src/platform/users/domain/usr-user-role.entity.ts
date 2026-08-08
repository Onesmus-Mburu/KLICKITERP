import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { UsrRoleEntity } from "./usr-role.entity";
import { UsrUserEntity } from "./usr-user.entity";

/** Pure join row — CASCADE on both sides since it has no existence independent of user+role. */
@Entity("usr_user_role")
@Index("uq_usr_user_role_user_id_role_id", ["userId", "roleId"], { unique: true })
export class UsrUserRoleEntity extends BaseEntity {
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UsrUserEntity;

  @Column({ type: "uuid", name: "role_id" })
  roleId!: string;

  @ManyToOne(() => UsrRoleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role!: UsrRoleEntity;
}
