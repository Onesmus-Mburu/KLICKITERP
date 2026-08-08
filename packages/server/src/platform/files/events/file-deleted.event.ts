import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface FileDeletedPayload extends Record<string, unknown> {
  fileId: string;
  bucket: string;
  objectKey: string;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
}

/**
 * Published (via the transactional outbox) whenever `FilesService.delete`
 * removes a `file_object` row (storage object already removed by that point
 * — see the service's doc comment). Lets any module holding a reference to
 * this file (e.g. Branding's `logo_file_id`) react and clear its own
 * reference; no in-process handler subscribes yet.
 */
export class FileDeletedEvent extends BaseDomainEvent<FileDeletedPayload> {
  readonly eventType = "files.file.deleted";
  readonly aggregateType = "file_object";

  constructor(fileId: string, payload: FileDeletedPayload) {
    super(fileId, payload);
  }
}
