/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Phase 6 Slice 16
 * (Part 1) — `domains/payments`/`domains/billing` are the first two
 * documented consumers (`ReceiptsService.captureReceipt()`/
 * `FeeStructuresService.publish()`, both calling `mint()` inside their own
 * transaction; `ReceiptsController`/`FeeStructuresController`'s "get by id"
 * paths calling `findByDocument()`).
 */
export { DocumentVerificationModule } from "./document-verification.module";
export { DocumentVerificationService } from "./application/document-verification.service";
export type { MintDocumentVerificationInput, VerifyDocumentResult } from "./application/document-verification.service";

export { DocvRecordEntity } from "./domain/docv-record.entity";
