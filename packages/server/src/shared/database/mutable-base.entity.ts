import { VersionColumn } from "typeorm";
import { BaseEntity } from "./base.entity";

/**
 * Adds optimistic locking (`version int`) for mutable business tables per
 * docs/phase-4/01-standards-and-migrations.md §2 — TypeORM increments this
 * automatically on every UPDATE and raises OptimisticLockVersionMismatchError
 * on a stale write.
 */
export abstract class MutableBaseEntity extends BaseEntity {
  @VersionColumn({ type: "int", name: "version" })
  version!: number;
}
