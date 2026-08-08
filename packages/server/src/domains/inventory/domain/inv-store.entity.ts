import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";

/**
 * Maps to `inv_store` (docs/phase-4/04-schema-operations.md §3) — a physical
 * or logical stock location (warehouse, shop counter, department store).
 * Module 13 (Inventory) **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation editing: `location`/
 * `keeper_user_id` change as staff/premises change, `is_active` toggles
 * when a store is decommissioned.
 *
 * `keeper_user_id` is a real FK to `usr_user` (imported via `platform/users`'
 * index.ts barrel — a plain entity target, no sibling-domain circular-require
 * concern, same as every other module's `UsrUserEntity` FK).
 */
@Entity("inv_store")
@Index("uq_inv_store_name", ["name"], { unique: true })
export class InvStoreEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 120, name: "location" })
  location!: string;

  @Column({ type: "uuid", name: "keeper_user_id" })
  keeperUserId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "keeper_user_id" })
  keeper?: UsrUserEntity;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}
