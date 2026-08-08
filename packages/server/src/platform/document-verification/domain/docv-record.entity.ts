import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";

/**
 * Maps to `docv_record` (migration `0237`) — Phase 6 Slice 16 (Part 1,
 * Document Security: Watermark + QR Verification backend). A fully generic,
 * append-only mint log any document-producing service can use to attach an
 * opaque, unguessable verification token to a document at creation/publish
 * time (`DocumentVerificationService.mint()`), later resolved back to a safe
 * summary by the public `GET /document-verification/:token` endpoint with no
 * auth (`.verify()`).
 *
 * `BaseEntity` (not `MutableBaseEntity`) — immutable once minted, no update
 * path anywhere in this module, the same "append-only, narrow single-purpose
 * write-after-insert-never" precedent `CommMessageEntity`/`FileObjectEntity`
 * establish (see `CommMessageEntity`'s own doc comment) — `updated_at`/
 * `updated_by` (inherited from `BaseEntity`) are a harmless, unused
 * superset, same as that precedent.
 *
 * `documentType`/`documentId` are a loose, FK-less polymorphic reference —
 * same convention `ApprInstanceEntity.entityType`/`.entityId` and
 * `CommMessageEntity.entityType`/`.entityId` already establish for a generic
 * platform module that must stay decoupled from every domain module that
 * might ever call it (this module's own `mayImport` is `["shared",
 * "platform/auth"]` only — see `module-deps.json`). Free-text, not an enum —
 * e.g. `"PAYMENT_RECEIPT"`/`"FEE_STRUCTURE"` today, any future
 * document-producing service can mint its own without a migration.
 *
 * `token` — the opaque lookup key embedded in the document's printed QR code
 * (Part 2, frontend). `varchar(64)` comfortably fits
 * `randomBytes(18).toString("base64url")` (~24 chars) with headroom.
 *
 * `summary` — `jsonb`, NOT NULL — the exact safe fields
 * `DocumentVerificationService.verify()` returns back to an anonymous
 * scanner; deliberately opaque to this entity/table (each minting caller
 * decides its own shape, e.g. `{payerName, total, receiptDate,
 * receiptNumber}`) so this module never needs to know anything about any
 * specific document type.
 */
@Entity("docv_record")
@Index("uq_docv_record_token", ["token"], { unique: true })
@Index("ix_docv_record_document", ["documentType", "documentId"])
export class DocvRecordEntity extends BaseEntity {
  @Column({ type: "varchar", length: 60, name: "document_type" })
  documentType!: string;

  @Column({ type: "uuid", name: "document_id" })
  documentId!: string;

  @Column({ type: "varchar", length: 120, name: "document_ref" })
  documentRef!: string;

  @Column({ type: "varchar", length: 64, name: "token" })
  token!: string;

  @Column({ type: "jsonb", name: "summary" })
  summary!: Record<string, unknown>;
}
