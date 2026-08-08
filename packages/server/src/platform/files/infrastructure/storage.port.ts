/** Result of a successful `putObject` — the storage-computed integrity/size facts `FilesService` persists onto `file_object`. */
export interface PutObjectResult {
  sha256: string;
  sizeBytes: number;
}

/**
 * Ports & adapters boundary (docs/phase-3/01-system-architecture.md §1.5,
 * ADR-006) for the object store backing `file_object`. `FilesService` only
 * ever depends on this interface — `MinioStorageAdapter` is the sole
 * implementation today; a future non-MinIO backend (real AWS S3, etc.) is a
 * new adapter behind the same port, not a rewrite of the application layer.
 */
export interface StoragePort {
  putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<PutObjectResult>;
  getSignedUrl(bucket: string, key: string, expirySeconds: number): Promise<string>;
  deleteObject(bucket: string, key: string): Promise<void>;
}

/** DI token — `StoragePort` is an interface (erased at runtime), so injection needs an explicit token. */
export const STORAGE_PORT = Symbol("STORAGE_PORT");
