/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Branding (Module 4)
 * is the first documented consumer: `brnd_theme.logo_file_id`/`favicon_file_id`
 * FK to `file_object`.
 */
export { FilesModule } from "./files.module";
export { FilesService } from "./application/files.service";
export type { UploadFileInput } from "./application/files.service";

export { FileObjectEntity } from "./domain/file-object.entity";

export { STORAGE_PORT } from "./infrastructure/storage.port";
export type { StoragePort, PutObjectResult } from "./infrastructure/storage.port";
