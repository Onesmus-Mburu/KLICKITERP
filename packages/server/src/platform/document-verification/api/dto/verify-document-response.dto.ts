import { ApiProperty } from "@nestjs/swagger";

/** `GET /document-verification/:token`'s 200 response shape — a plain class (not an inline interface) so this shows up correctly in `@klickit/contracts` after codegen. */
export class VerifyDocumentResponseDto {
  @ApiProperty({ description: "Free-text document type set by the minting service, e.g. PAYMENT_RECEIPT / FEE_STRUCTURE" })
  documentType!: string;

  @ApiProperty({ description: "Human-readable reference for the document, e.g. the receipt number or fee-structure version label" })
  documentRef!: string;

  @ApiProperty({ type: "object", additionalProperties: true, description: "The exact safe fields the minting caller chose to show back on a scan" })
  summary!: Record<string, unknown>;

  @ApiProperty({ description: "When this verification record was minted (docv_record.created_at)" })
  issuedAt!: Date;
}
