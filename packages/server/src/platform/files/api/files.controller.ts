import { Body, Controller, Delete, Get, Param, Post, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { FilesService } from "../application/files.service";
import { FileObjectEntity } from "../domain/file-object.entity";
import { FileObjectResponseDto } from "./dto/file-object-response.dto";
import { ListFilesQueryDto } from "./dto/list-files-query.dto";
import { SignedUrlQueryDto } from "./dto/signed-url-query.dto";
import { SignedUrlResponseDto } from "./dto/signed-url-response.dto";
import { UploadFileFieldsDto } from "./dto/upload-file-fields.dto";
import { AuthenticatedRequest } from "./request-context";

const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

/** `uploadedByUser` is the optional, not-always-loaded relation — never serialize it over HTTP. */
function toView(entity: FileObjectEntity): FileObjectResponseDto {
  const { uploadedByUser: _uploadedByUser, ...view } = entity;
  return view;
}

@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @RequirePermission("files:file:upload")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary" },
        entityType: { type: "string", maxLength: 60, nullable: true, description: "Polymorphic owner type, e.g. STUDENT" },
        entityId: { type: "string", format: "uuid", nullable: true, description: "Polymorphic owner id" },
      },
    },
  })
  @ApiOperation({
    summary: "Upload a file",
    description:
      "Stores the binary in MinIO (object store) and its metadata in file_object. " +
      "Rejects oversized uploads and disallowed MIME types (AppConfigService-configurable).",
  })
  @ApiResponse({ status: 201, type: FileObjectResponseDto })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() fields: UploadFileFieldsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FileObjectResponseDto> {
    if (!file) {
      throw new ValidationException("A file is required (multipart field name: file)");
    }
    const uploadedByUserId = req.user?.sub;
    if (!uploadedByUserId) {
      throw new ValidationException("Authenticated user is required to upload a file");
    }

    const saved = await this.filesService.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mime: file.mimetype,
      entityType: fields.entityType ?? null,
      entityId: fields.entityId ?? null,
      uploadedByUserId,
    });
    return toView(saved);
  }

  @Get()
  @RequirePermission("files:file:view")
  @ApiOperation({ summary: "List files attached to an entity" })
  @ApiQuery({ name: "entityType", required: true, type: String })
  @ApiQuery({ name: "entityId", required: true, type: String })
  @ApiResponse({ status: 200, type: [FileObjectResponseDto] })
  async list(@Query() query: ListFilesQueryDto): Promise<FileObjectResponseDto[]> {
    const rows = await this.filesService.listByEntity(query.entityType, query.entityId);
    return rows.map(toView);
  }

  @Get(":id/signed-url")
  @RequirePermission("files:file:view")
  @ApiOperation({ summary: "Get a time-limited signed download URL for a file" })
  @ApiQuery({ name: "expirySeconds", required: false, enum: ["60", "300", "900", "3600", "86400"] })
  @ApiResponse({ status: 200, type: SignedUrlResponseDto })
  async signedUrl(@Param("id") id: string, @Query() query: SignedUrlQueryDto): Promise<SignedUrlResponseDto> {
    const expirySeconds = query.expirySeconds
      ? Number.parseInt(query.expirySeconds, 10)
      : DEFAULT_SIGNED_URL_EXPIRY_SECONDS;
    const url = await this.filesService.getSignedUrl(id, expirySeconds);
    return { url, expiresInSeconds: expirySeconds };
  }

  @Delete(":id")
  @RequirePermission("files:file:delete")
  @ApiOperation({ summary: "Delete a file (removes the storage object, then the file_object row)" })
  @ApiResponse({ status: 200 })
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<{ deleted: true }> {
    await this.filesService.delete(id, req.user?.sub ?? null);
    return { deleted: true };
  }
}
