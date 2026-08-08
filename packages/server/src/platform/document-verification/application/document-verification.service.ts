import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { EntityManager } from "typeorm";
import { DocvRecordRepository } from "../infrastructure/docv-record.repository";

/** `randomBytes(TOKEN_BYTES).toString("base64url")` — 18 bytes (144 bits) yields a ~24-char token, comfortably inside `docv_record.token`'s `varchar(64)`, short enough for a clean QR payload, and astronomically collision-resistant (no retry-on-collision loop is warranted at this entropy). Same `node:crypto` primitive `platform/auth/application/password.service.ts`'s reset-token flow already uses (`randomBytes(32).toString("hex")`), just base64url instead of hex here for a shorter payload. */
const TOKEN_BYTES = 18;

export interface MintDocumentVerificationInput {
  /** Free-text, e.g. "PAYMENT_RECEIPT" / "FEE_STRUCTURE" — not an enum, see `DocvRecordEntity`'s own doc comment. */
  documentType: string;
  /** Loose reference to the source document's own id — no FK, cross-module by design. */
  documentId: string;
  /** Human-readable reference shown back on a scan, e.g. the receipt number or a fee-structure version label. */
  documentRef: string;
  /** The exact safe fields to show back on a scan — deliberately opaque to this module. */
  summary: Record<string, unknown>;
}

export interface VerifyDocumentResult {
  documentType: string;
  documentRef: string;
  summary: Record<string, unknown>;
  issuedAt: Date;
}

/**
 * Phase 6 Slice 16 (Part 1) — the fully generic minting/lookup service any
 * document-producing service composes against. `mint()` mirrors
 * `platform/settings`' `NumberingService.allocate(em, ...)` composability
 * convention (see that method's own doc comment, the concrete template this
 * shape was built from): it takes the CALLER's own already-open transaction
 * `EntityManager` and never opens its own — the `docv_record` insert lives
 * inside whatever transaction is also writing the document being minted for,
 * so a crash between "mint" and "commit the document" simply rolls both back
 * together, and a caller never observes a token for a document that didn't
 * actually get created.
 *
 * `findByDocument()`/`verify()` are plain, unauthenticated lookups — no
 * `EntityManager` needed, used outside any transaction (the two wired-in
 * callers' own "get by id" response paths, and the public
 * `DocumentVerificationController` respectively).
 */
@Injectable()
export class DocumentVerificationService {
  constructor(private readonly repository: DocvRecordRepository) {}

  async mint(em: EntityManager, params: MintDocumentVerificationInput): Promise<{ token: string }> {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const created = await this.repository.create(
      {
        documentType: params.documentType,
        documentId: params.documentId,
        documentRef: params.documentRef,
        token,
        summary: params.summary,
      },
      em,
    );
    return { token: created.token };
  }

  /** Used by a document's own "get by id" response path to surface an already-minted token without denormalizing a new column onto the document's own table (see `DocvRecordEntity`'s doc comment). Returns `null` for rows that predate this feature (minted before this module existed) or a document that was never minted (e.g. a DRAFT fee structure — never published). */
  async findByDocument(documentType: string, documentId: string): Promise<{ token: string } | null> {
    const row = await this.repository.findByDocument(documentType, documentId);
    return row ? { token: row.token } : null;
  }

  /** No auth — this is what the public `GET /document-verification/:token` route calls. Returns `null` on a miss (garbage/unknown token); the controller turns that into a real 404. */
  async verify(token: string): Promise<VerifyDocumentResult | null> {
    const row = await this.repository.findByToken(token);
    if (!row) return null;
    return {
      documentType: row.documentType,
      documentRef: row.documentRef,
      summary: row.summary,
      issuedAt: row.createdAt,
    };
  }
}
