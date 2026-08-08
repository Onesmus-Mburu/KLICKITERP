import { BeforeInsert, Column, Entity, PrimaryColumn } from "typeorm";
import { generateUuidV7 } from "../ids/uuid7";

/**
 * Maps to `audit.chain_anchor` (docs/phase-4/02-schema-platform-accounting.md
 * §3) — periodic sweep checkpoints of the audit hash chain, letting an
 * integrity sweep resume/verify from the last anchor instead of replaying
 * the whole chain. Written by the (future) sweep job, not built in this pass.
 */
@Entity({ name: "chain_anchor", schema: "audit" })
export class ChainAnchorEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "bigint", name: "up_to_seq" })
  upToSeq!: string;

  @Column({ type: "varchar", length: 64, name: "anchor_hash" })
  anchorHash!: string;

  @Column({ type: "timestamptz", name: "at" })
  at!: Date;

  @BeforeInsert()
  assignId(): void {
    if (!this.id) {
      this.id = generateUuidV7();
    }
  }
}
