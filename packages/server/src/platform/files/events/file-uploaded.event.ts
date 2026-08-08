import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface FileUploadedPayload extends Record<string, unknown> {
  fileId: string;
  bucket: string;
  objectKey: string;
  originalName: string;
  mime: string;
  sizeBytes: string;
  entityType: string | null;
  entityId: string | null;
  uploadedBy: string;
}

/**
 * Published (via the transactional outbox) whenever `FilesService.upload`
 * commits a new `file_object` row. No in-process handler subscribes yet —
 * Branding (Module 4, `brnd_theme.logo_file_id`/`favicon_file_id`) and
 * later modules that attach documents to entities are the eventual
 * consumers.
 */
export class FileUploadedEvent extends BaseDomainEvent<FileUploadedPayload> {
  readonly eventType = "files.file.uploaded";
  readonly aggregateType = "file_object";

  constructor(fileId: string, payload: FileUploadedPayload) {
    super(fileId, payload);
  }
}
