import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";
import { InvStoreEntity } from "./inv-store.entity";

export type InvTransferStatus = "ISSUED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
export const INV_TRANSFER_STATUSES: readonly InvTransferStatus[] = [
  "ISSUED",
  "IN_TRANSIT",
  "RECEIVED",
  "CANCELLED",
];

/**
 * Maps to `inv_transfer` (docs/phase-4/04-schema-operations.md §3) — a
 * two-step (issue -> receive) inter-store stock transfer header
 * (FR-INV-003.1's `TRANSFER(2-step)`). Module 13 (Inventory) **foundation
 * pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation status progression
 * (`ISSUED -> IN_TRANSIT -> RECEIVED`, or `-> CANCELLED`) and `received_by`
 * is written only once the receiving side of the two-step flow completes.
 *
 * `from_store_id`/`to_store_id` are real FKs to `inv_store`; `issued_by` is
 * required (a transfer cannot exist without an issuer), `received_by` is
 * nullable until received — both real FKs to `usr_user` (imported via
 * `platform/users`' index.ts barrel, entity-only, no circular-require risk).
 */
@Entity("inv_transfer")
@Index("uq_inv_transfer_number", ["number"], { unique: true })
@Check("ck_inv_transfer_status", `"status" IN ('ISSUED','IN_TRANSIT','RECEIVED','CANCELLED')`)
export class InvTransferEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "from_store_id" })
  fromStoreId!: string;

  @ManyToOne(() => InvStoreEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "from_store_id" })
  fromStore?: InvStoreEntity;

  @Column({ type: "uuid", name: "to_store_id" })
  toStoreId!: string;

  @ManyToOne(() => InvStoreEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "to_store_id" })
  toStore?: InvStoreEntity;

  @Column({ type: "varchar", length: 12, name: "status" })
  status!: InvTransferStatus;

  @Column({ type: "uuid", name: "issued_by" })
  issuedBy!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "issued_by" })
  issuer?: UsrUserEntity;

  @Column({ type: "uuid", name: "received_by", nullable: true })
  receivedBy!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "received_by" })
  receiver?: UsrUserEntity | null;
}
