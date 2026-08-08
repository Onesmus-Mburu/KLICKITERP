import { promises as fs } from "node:fs";
import * as path from "node:path";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";

/**
 * Reads an S3 `GetObjectCommand` response body into a `Buffer` — the AWS SDK
 * v3 types this generically across runtimes (Node stream / web
 * ReadableStream / Blob); `transformToByteArray()` is the SDK's own
 * runtime-agnostic helper (available since the SDK version this repo
 * depends on), so this never needs to special-case Node's `Readable`.
 */
async function bodyToBuffer(body: unknown): Promise<Buffer> {
  const withTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof withTransform.transformToByteArray === "function") {
    return Buffer.from(await withTransform.transformToByteArray());
  }
  throw new Error("S3 object body does not support transformToByteArray()");
}

/**
 * Raw, backups-ops-owned MinIO client — deliberately SEPARATE from
 * `platform/files`' `StoragePort`/`MinioStorageAdapter` (which this module
 * DOES reuse, via the `STORAGE_PORT` cross-module grant, for the actual
 * backup-archive upload/delete). `StoragePort` only exposes what
 * `FilesService` itself needs (`putObject`/`getSignedUrl`/`deleteObject`) —
 * no bucket-level listing or server-side object fetch, both of which this
 * module genuinely needs: (1) mirroring the Files module's default bucket
 * into a backup archive (`mirrorBucketToDir`), and (2) fetching an
 * already-uploaded backup archive back for restore-verification
 * (`getObject`, used by `RestoreVerificationService.materializeBackupFile()`
 * when no LOCAL destination copy is available). Extending the shared
 * `StoragePort` interface for one module's need was judged a bigger
 * footprint than this small, narrowly-scoped second client reusing the same
 * MinIO credentials (`AppConfigService.minioEndpoint`/etc — same connection
 * `MinioStorageAdapter` itself builds from).
 */
@Injectable()
export class BackupStorageClient {
  private readonly client: S3Client;

  constructor(private readonly config: AppConfigService) {
    const scheme = this.config.minioUseSsl ? "https" : "http";
    this.client = new S3Client({
      endpoint: `${scheme}://${this.config.minioEndpoint}`,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.minioAccessKey,
        secretAccessKey: this.config.minioSecretKey,
      },
    });
  }

  /** Lightweight connectivity check for `OpsHealthService` — a bucket listing call, cheaper than a full mirror. */
  async listObjects(bucket: string): Promise<string[]> {
    const result = await this.client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    return (result.Contents ?? []).map((obj) => obj.Key ?? "").filter((key) => key.length > 0);
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return bodyToBuffer(result.Body);
  }

  /**
   * Downloads every object in `bucket` into `destDir`, preserving the
   * object key as the relative path (so `key = "a/b/c.pdf"` lands at
   * `destDir/a/b/c.pdf`) — `BackupOrchestratorService.runBackup()`'s "MinIO/
   * files tarball" step (docs/phase-3/03-deployment-infrastructure.md §6).
   * If the bucket is unreachable (MinIO down, or the bucket doesn't exist
   * yet in a fresh dev environment — docs/phase-5/PROGRESS.md "Environment
   * status"), this throws and `runBackup()`'s outer try/catch turns that
   * into a `FAILED` run — a backup silently missing its files tier would be
   * misleading, so this is treated as a hard failure of the whole backup,
   * the same "surface real infra gaps honestly" standard `pg_dump` gets.
   */
  async mirrorBucketToDir(bucket: string, destDir: string): Promise<{ objectCount: number; totalBytes: number }> {
    let objectCount = 0;
    let totalBytes = 0;
    let continuationToken: string | undefined;

    do {
      const listResult = await this.client.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
      );
      for (const obj of listResult.Contents ?? []) {
        if (!obj.Key) continue;
        const buffer = await this.getObject(bucket, obj.Key);
        const destPath = path.join(destDir, obj.Key);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, buffer);
        objectCount += 1;
        totalBytes += buffer.byteLength;
      }
      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    return { objectCount, totalBytes };
  }
}
