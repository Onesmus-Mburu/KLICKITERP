import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";

@Entity("usr_permission")
@Index("uq_usr_permission_code", ["code"], { unique: true })
export class UsrPermissionEntity extends BaseEntity {
  @Column({ type: "varchar", length: 80, name: "code" })
  code!: string;

  @Column({ type: "varchar", length: 30, name: "module" })
  module!: string;

  @Column({ type: "text", name: "description", nullable: true })
  description!: string | null;

  @Column({ type: "boolean", name: "is_write", default: false })
  isWrite!: boolean;
}
