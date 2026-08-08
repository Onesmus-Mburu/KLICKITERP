import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../auth";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { DocumentVerificationService } from "../application/document-verification.service";
import { VerifyDocumentResponseDto } from "./dto/verify-document-response.dto";

/**
 * Exactly one route — the public, unauthenticated verification lookup a
 * printed document's QR code links to (Part 2, frontend, not built yet).
 * Uses the already-established `@Public()` decorator
 * (`platform/auth/infrastructure/guards/public.decorator.ts`, imported via
 * `platform/auth`'s index.ts barrel — same precedent
 * `platform/branding`'s own `GET /branding/theme/current` route documents on
 * its `mayImport` entry) to opt out of the `JwtAuthGuard`/`PermissionsGuard`/
 * `AuthorityGuard` pipeline; a scanning parent/guardian holds no credentials
 * at all.
 */
@ApiTags("document-verification")
@Controller("document-verification")
export class DocumentVerificationController {
  constructor(private readonly documentVerificationService: DocumentVerificationService) {}

  @Public()
  @Get(":token")
  @ApiOperation({
    summary: "Resolve a document-verification token to its safe summary (public, no auth)",
    description:
      "The endpoint a printed financial document's QR code links to, confirming the document genuinely came " +
      "from this specific school's Klickit instance. `token` is an opaque, unguessable random value " +
      "(18 bytes/base64url) minted at document creation/publish time — never derived from or predictable off " +
      "the document's own id.",
  })
  @ApiResponse({ status: 200, type: VerifyDocumentResponseDto })
  @ApiResponse({ status: 404, description: "Unknown or garbage token" })
  async verify(@Param("token") token: string): Promise<VerifyDocumentResponseDto> {
    const result = await this.documentVerificationService.verify(token);
    if (!result) {
      throw new NotFoundException("DocumentVerification", token);
    }
    return result;
  }
}
