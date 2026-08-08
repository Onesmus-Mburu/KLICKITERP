import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `inv_category` (docs/phase-4/04-schema-operations.md §3) — a
 * hierarchical item category (self-referencing `parent_id`). Module 13
 * (Inventory) **foundation pass only** (docs/phase-5/PROGRESS.md):
 * entities/repositories/migration/triggers. Application services (item
 * master, weighted-average stock movement engine, transfers, stock-takes,
 * GRN/POS integration hooks, controllers, tests, seed) land in a later pass.
 *
 * `MutableBaseEntity` — genuine post-creation editing: a category's `name`
 * can be renamed and its `parent_id` re-parented as the catalogue tree is
 * reorganized, unlike an append-only record.
 *
 * `parent_id` is a nullable self-FK (`ON DELETE RESTRICT` — the same
 * "self-reference stays restrict" choice `proc_purchase_order.supersedes_id`
 * made — a category with children cannot be deleted out from under them).
 */
@Entity("inv_category")
@Index("uq_inv_category_name", ["name"], { unique: true })
export class InvCategoryEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "uuid", name: "parent_id", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => InvCategoryEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "parent_id" })
  parent?: InvCategoryEntity | null;
}
