import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/**
 * The non-file multipart fields accepted alongside the binary upload. The
 * file itself is documented via `@ApiBody`'s raw schema on the controller
 * (multipart bodies aren't a single class-validator-friendly shape), not
 * this DTO.
 */
export class UploadFileFieldsDto {
  @ApiPropertyOptional({ maxLength: 60, description: "Polymorphic owner type this upload attaches to, e.g. STUDENT" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Polymorphic owner id this upload attaches to" })
  @IsOptional()
  @IsUUID()
  entityId?: string;
}
