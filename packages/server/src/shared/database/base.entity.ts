import { BeforeInsert, Column, CreateDateColumn, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { generateUuidV7 } from "../ids/uuid7";

/**
 * Standard columns every app table carries (docs/phase-4/01-standards-and-migrations.md
 * §2 "Standard columns" row, DR-007): UUIDv7 PK (time-ordered for index
 * locality), created_at/updated_at, created_by/updated_by. `created_by` /
 * `updated_by` are populated by the calling service layer (or a future audit
 * interceptor) — this base class only owns column shape, not who's asking.
 */
export abstract class BaseEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;

  @Column({ type: "uuid", name: "created_by", nullable: true })
  createdBy!: string | null;

  @Column({ type: "uuid", name: "updated_by", nullable: true })
  updatedBy!: string | null;

  @BeforeInsert()
  assignId(): void {
    if (!this.id) {
      this.id = generateUuidV7();
    }
  }
}
