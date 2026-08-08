import { ApiProperty } from "@nestjs/swagger";

/**
 * HTTP response shape for `file_object` — a plain class (not
 * `Omit<FileObjectEntity, "uploadedByUser">`) so the controller's `toView`
 * mapper has a concrete Swagger-documented target and the optional,
 * not-always-loaded `uploadedByUser` relation never leaks into a response.
 */
export class FileObjectResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  bucket!: string;

  @ApiProperty()
  objectKey!: string;

  @ApiProperty()
  originalName!: string;

  @ApiProperty()
  mime!: string;

  @ApiProperty({ description: "bigint, represented as a decimal string" })
  sizeBytes!: string;

  @ApiProperty()
  sha256!: string;

  @ApiProperty({ nullable: true, type: String })
  entityType!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  entityId!: string | null;

  @ApiProperty({ format: "uuid" })
  uploadedBy!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  createdBy!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  updatedBy!: string | null;
}
