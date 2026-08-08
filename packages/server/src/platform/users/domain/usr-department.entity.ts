import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { UsrUserEntity } from "./usr-user.entity";

@Entity("usr_department")
@Index("uq_usr_department_name", ["name"], { unique: true })
export class UsrDepartmentEntity extends BaseEntity {
  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "uuid", name: "head_user_id", nullable: true })
  headUserId!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "head_user_id" })
  headUser?: UsrUserEntity | null;
}
