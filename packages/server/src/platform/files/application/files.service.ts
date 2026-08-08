import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { FileObjectEntity } from "../domain/file-object.entity";
import { FileDeletedEvent } from "../events/file-deleted.event";
import { FileUploadedEvent } from "../events/file-uploaded.event";
import { FileObjectRepository } from "../infrastructure/file-object.repository";
import { STORAGE_PORT, StoragePort } from "../infrastructure/storage.port";

export interface UploadFileInput {
  buffer: Buffer;
  originalName: string;
  mime: string;
  uploadedByUserId: string;
  entityType?: string | null;
  entityId?: string | null;
  bucket?: string;
}

const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

/**
 * Files are immutable once uploaded (delete-and-reupload, never edit — see
 * `FileObjectEntity`'s doc comment) so this service exposes upload/read/
 * delete/list only, no `update()`.
 *
 * `upload()` writes to the storage port THEN inserts the `file_object` row —
 * not a distributed transaction (docs/phase-3/01-system-architecture.md:
 * files aren't financial data, unlike `gl_journal`/`gl_journal_line`, so this
 * acceptable-inconsistency window is a deliberate, documented trade-off, not
 * an oversight). If the DB insert fails after a successful storage write,
 * `upload()` attempts a best-effort compensating delete of the now-orphaned
 * object and rethrows the original error — a failed compensating delete is
 * swallowed (logged as a side effect of the thrown error) so it never masks
 * the real failure the caller needs to see.
 */
@Injectable()
export class FilesService {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly fileObjectRepository: FileObjectRepository,
    private readonly outboxWriter: OutboxWriterService,
    private readonly config: AppConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async upload(input: UploadFileInput): Promise<FileObjectEntity> {
    this.assertUploadAllowed(input.mime, input.buffer.byteLength);

    const bucket = input.bucket ?? this.config.minioBucketDefault;
    const objectKey = this.buildObjectKey(input.originalName);

    const { sha256, sizeBytes } = await this.storage.putObject(bucket, objectKey, input.buffer, input.mime);

    try {
      return await runInTransaction(this.dataSource, async (manager) => {
        const saved = await this.fileObjectRepository.create(
          {
            bucket,
            objectKey,
            originalName: input.originalName,
            mime: input.mime,
            sizeBytes: String(sizeBytes),
            sha256,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            uploadedBy: input.uploadedByUserId,
            createdBy: input.uploadedByUserId,
            updatedBy: input.uploadedByUserId,
          },
          manager,
        );

        await this.outboxWriter.write(
          manager,
          new FileUploadedEvent(saved.id, {
            fileId: saved.id,
            bucket: saved.bucket,
            objectKey: saved.objectKey,
            originalName: saved.originalName,
            mime: saved.mime,
            sizeBytes: saved.sizeBytes,
            entityType: saved.entityType,
            entityId: saved.entityId,
            uploadedBy: saved.uploadedBy,
          }),
        );

        return saved;
      });
    } catch (error) {
      try {
        await this.storage.deleteObject(bucket, objectKey);
      } catch {
        // Best-effort only — the original error (thrown below) is authoritative;
        // a failed compensating delete just means a small orphaned object in
        // storage, not a data-integrity problem (no file_object row references it).
      }
      throw error;
    }
  }

  async getSignedUrl(fileId: string, expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS): Promise<string> {
    const file = await this.fileObjectRepository.findByIdOrFail(fileId);
    return this.storage.getSignedUrl(file.bucket, file.objectKey, expirySeconds);
  }

  async delete(fileId: string, actorId: string | null): Promise<void> {
    const file = await this.fileObjectRepository.findByIdOrFail(fileId);

    await this.storage.deleteObject(file.bucket, file.objectKey);

    await runInTransaction(this.dataSource, async (manager) => {
      await this.fileObjectRepository.deleteById(fileId, manager);
      await this.outboxWriter.write(
        manager,
        new FileDeletedEvent(file.id, {
          fileId: file.id,
          bucket: file.bucket,
          objectKey: file.objectKey,
          entityType: file.entityType,
          entityId: file.entityId,
          actorId,
        }),
      );
    });
  }

  async listByEntity(entityType: string, entityId: string): Promise<FileObjectEntity[]> {
    return this.fileObjectRepository.listByEntity(entityType, entityId);
  }

  async findByIdOrFail(fileId: string): Promise<FileObjectEntity> {
    return this.fileObjectRepository.findByIdOrFail(fileId);
  }

  /** `uuid7/sanitized-original-name` — time-ordered prefix keeps bucket listings roughly chronological; the UUID segment guarantees collision-resistance even for two uploads of the same filename. */
  private buildObjectKey(originalName: string): string {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
    return `${generateUuidV7()}/${safeName}`;
  }

  private assertUploadAllowed(mime: string, sizeBytes: number): void {
    const maxBytes = this.config.fileMaxUploadBytes;
    if (sizeBytes > maxBytes) {
      throw new ValidationException(`File exceeds maximum upload size of ${maxBytes} bytes`, {
        sizeBytes,
        maxBytes,
      });
    }

    const allowed = this.config.fileAllowedMimeTypes;
    if (!allowed.includes(mime)) {
      throw new ValidationException(`MIME type not allowed: ${mime}`, { mime, allowed });
    }
  }
}
