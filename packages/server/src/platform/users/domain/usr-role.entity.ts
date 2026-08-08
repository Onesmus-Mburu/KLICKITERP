import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";

@Entity("usr_role")
@Index("uq_usr_role_name", ["name"], { unique: true })
export class UsrRoleEntity extends BaseEntity {
  @Column({ type: "varchar", length: 60, name: "name" })
  name!: string;

  @Column({ type: "text", name: "description", nullable: true })
  description!: string | null;

  @Column({ type: "boolean", name: "is_system_template", default: false })
  isSystemTemplate!: boolean;

  /** BR-SEC-04 write-block marker: trg_auditor_no_write rejects is_write=true grants on these roles. */
  @Column({ type: "boolean", name: "is_auditor_class", default: false })
  isAuditorClass!: boolean;
}
