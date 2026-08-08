import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { PutObjectResult, StoragePort } from "./storage.port";

/**
 * S3-compatible `StoragePort` adapter for MinIO (docs/phase-3/01-system-architecture.md
 * C4 diagram: "MinIO (S3) files, exports, backups"). `forcePathStyle: true`
 * because MinIO doesn't do virtual-hosted-style bucket DNS out of the box —
 * standard for self-hosted S3-compatible stores. SHA-256 of the upload body
 * is computed here (not trusted from the client) so `file_object.sha256`
 * always reflects what was actually written to the bucket.
 */
@Injectable()
export class MinioStorageAdapter implements StoragePort {
  private readonly client: S3Client;

  constructor(private readonly config: AppConfigService) {
    const scheme = this.config.minioUseSsl ? "https" : "http";
    this.client = new S3Client({
      endpoint: `${scheme}://${this.config.minioEndpoint}`,
      region: "us-east-1", // MinIO ignores region, but the SDK requires one to be set
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.minioAccessKey,
        secretAccessKey: this.config.minioSecretKey,
      },
    });
  }

  async putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<PutObjectResult> {
    const sha256 = createHash("sha256").update(body).digest("hex");
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    );
    return { sha256, sizeBytes: body.byteLength };
  }

  async getSignedUrl(bucket: string, key: string, expirySeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expirySeconds,
    });
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
