import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { CommChannel } from "./comm-template.entity";

/**
 * Maps to `comm_optout` (docs/phase-4/02-schema-platform-accounting.md §5).
 * `BaseEntity` (not `MutableBaseEntity`) — the DDL as written has no
 * `updated_at`/`updated_by`/`version` columns; an opt-out row is a simple
 * flag (create/delete), never edited in place, matching this task's
 * explicit note.
 *
 * `guardian_id` is a bare `uuid` column with **no FK constraint** — the DDL
 * has no `→` arrow on this column, deliberately: the `students`/guardians
 * module (#8) doesn't exist yet, so there is no `gdn_guardian` (or similar)
 * table to reference. Do not add a foreign key here even once that module
 * lands without re-checking this column's exact target table name.
 */
@Entity("comm_optout")
@Index("uq_comm_optout_guardian_channel_scope", ["guardianId", "channel", "scope"], { unique: true })
export class CommOptoutEntity extends BaseEntity {
  @Column({ type: "uuid", name: "guardian_id" })
  guardianId!: string;

  @Column({ type: "varchar", length: 10, name: "channel" })
  channel!: CommChannel;

  @Column({ type: "varchar", length: 30, name: "scope" })
  scope!: string;
}
