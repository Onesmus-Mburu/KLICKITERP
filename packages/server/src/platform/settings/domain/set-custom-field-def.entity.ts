import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type SetCustomFieldEntityType = "STUDENT" | "SUPPLIER" | "EMPLOYEE" | "ASSET";
export type SetCustomFieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT";

/** Maps to `set_custom_field_def` (docs/phase-4/02-schema-platform-accounting.md §4). */
@Entity("set_custom_field_def")
@Index("uq_set_custom_field_def_entity_key", ["entity", "key"], { unique: true })
@Check("ck_set_custom_field_def_entity", `"entity" IN ('STUDENT','SUPPLIER','EMPLOYEE','ASSET')`)
@Check("ck_set_custom_field_def_field_type", `"field_type" IN ('TEXT','NUMBER','DATE','SELECT')`)
export class SetCustomFieldDefEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "entity" })
  entity!: SetCustomFieldEntityType;

  @Column({ type: "varchar", length: 40, name: "key" })
  key!: string;

  @Column({ type: "varchar", length: 80, name: "label" })
  label!: string;

  @Column({ type: "varchar", length: 10, name: "field_type" })
  fieldType!: SetCustomFieldType;

  @Column({ type: "jsonb", name: "options", nullable: true })
  options!: unknown | null;

  @Column({ type: "boolean", name: "is_required", default: false })
  isRequired!: boolean;
}
