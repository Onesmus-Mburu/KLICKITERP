import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { UsrUserEntity } from "../../users/domain/usr-user.entity";

/**
 * Maps to `file_object` (docs/phase-4/02-schema-platform-accounting.md §4).
 *
 * Deliberately extends `BaseEntity` (id/created_at/created_by + the
 * `updated_at`/`updated_by` columns `BaseEntity` always carries), not
 * `MutableBaseEntity` — the DDL as written has no `updated_at`/`updated_by`/
 * `version` columns at all, and that's intentional: files are immutable once
 * uploaded (delete-and-reupload, never edit — see `FilesService`, which has
 * no `update()` method). `BaseEntity`'s `updated_at`/`updated_by` columns are
 * a harmless superset of the DDL (DR-007 "every table" standard-column rule,
 * docs/phase-4/01-standards-and-migrations.md §2) — nothing in this module
 * ever assigns to them after insert, so they stay equal to
 * `created_at`/`created_by`/null for the row's whole life. No `version`
 * column exists (BaseEntity, not MutableBaseEntity) since there is no UPDATE
 * path to optimistically lock.
 */
@Entity("file_object")
@Index("uq_file_object_object_key", ["objectKey"], { unique: true })
@Index("ix_file_object_entity", ["entityType", "entityId"])
export class FileObjectEntity extends BaseEntity {
  @Column({ type: "varchar", length: 40, name: "bucket" })
  bucket!: string;

  @Column({ type: "varchar", length: 200, name: "object_key" })
  objectKey!: string;

  @Column({ type: "varchar", length: 200, name: "original_name" })
  originalName!: string;

  @Column({ type: "varchar", length: 100, name: "mime" })
  mime!: string;

  /** `bigint` represented as `string` (JS `number` can't safely hold the full 64-bit range) — matches `SetNumberingSeriesEntity.nextNo`'s convention. */
  @Column({ type: "bigint", name: "size_bytes" })
  sizeBytes!: string;

  @Column({ type: "varchar", length: 64, name: "sha256" })
  sha256!: string;

  @Column({ type: "varchar", length: 60, name: "entity_type", nullable: true })
  entityType!: string | null;

  @Column({ type: "uuid", name: "entity_id", nullable: true })
  entityId!: string | null;

  @Column({ type: "uuid", name: "uploaded_by" })
  uploadedBy!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "uploaded_by" })
  uploadedByUser?: UsrUserEntity;
}
