import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { SettingsService } from "../../../platform/settings";

export interface OffsiteS3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  useSsl: boolean;
}

const SETTINGS_KEY_ENABLED = "backups.offsite_s3.enabled";
const SETTINGS_KEY_ENDPOINT = "backups.offsite_s3.endpoint";
const SETTINGS_KEY_REGION = "backups.offsite_s3.region";
const SETTINGS_KEY_BUCKET = "backups.offsite_s3.bucket";
const SETTINGS_KEY_ACCESS_KEY = "backups.offsite_s3.access_key";
const SETTINGS_KEY_SECRET_KEY = "backups.offsite_s3.secret_key";
const SETTINGS_KEY_USE_SSL = "backups.offsite_s3.use_ssl";

/**
 * Optional offsite S3 destination (docs/phase-3/03-deployment-infrastructure.md
 * §6: "optional offsite S3, 12 monthly, school-chosen"). Configured at
 * RUNTIME via the generic `platform/settings` key/value store
 * (`SettingsService`), not `AppConfigService`/env vars — this is a
 * per-school, credential-bearing, genuinely optional setting a school opts
 * into after install, matching "runtime-changeable settings live in the DB
 * via Settings module — .env is infrastructure-only" (docs/phase-3/03 §3),
 * the same category `set_integration_config` rows fall into.
 *
 * Deliberately NOT modeled as a new `SetIntegrationKind` on
 * `set_integration_config` — that registry exists for PLUGGABLE-ADAPTER
 * selection (SMTP/SMS/FCM/accounting-sync, several interchangeable
 * providers per kind), whereas offsite S3 is a single fixed destination
 * shape; minting a new enum member would require altering ANOTHER module's
 * CHECK constraint/migration for a single-shape config this module owns
 * end-to-end. The generic `SettingsService.set(key, value, isSecret)` /
 * `.getTyped()` API (AES-256-GCM-encrypts `isSecret=true` values
 * transparently) is the better-fit, lower-footprint choice — same reasoning
 * documented on this module's `module-deps.json` entry.
 */
@Injectable()
export class OffsiteS3Adapter {
  constructor(private readonly settings: SettingsService) {}

  /** Returns `null` when offsite S3 isn't enabled or isn't fully configured — callers treat that as "this destination is skipped", never an error. */
  async getConfig(): Promise<OffsiteS3Config | null> {
    const enabled = await this.settings.get<boolean>(SETTINGS_KEY_ENABLED);
    if (!enabled) return null;

    const endpoint = await this.settings.get<string>(SETTINGS_KEY_ENDPOINT);
    const bucket = await this.settings.get<string>(SETTINGS_KEY_BUCKET);
    const accessKey = await this.settings.get<string>(SETTINGS_KEY_ACCESS_KEY);
    const secretKey = await this.settings.get<string>(SETTINGS_KEY_SECRET_KEY);
    if (!endpoint || !bucket || !accessKey || !secretKey) return null;

    const region = (await this.settings.get<string>(SETTINGS_KEY_REGION)) ?? "us-east-1";
    const useSsl = (await this.settings.get<boolean>(SETTINGS_KEY_USE_SSL)) ?? true;

    return { endpoint, region, bucket, accessKey, secretKey, useSsl };
  }

  async putObject(config: OffsiteS3Config, key: string, body: Buffer): Promise<void> {
    const client = this.buildClient(config);
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentLength: body.byteLength }));
  }

  async getObject(config: OffsiteS3Config, key: string): Promise<Buffer> {
    const client = this.buildClient(config);
    const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const withTransform = result.Body as { transformToByteArray?: () => Promise<Uint8Array> };
    if (typeof withTransform.transformToByteArray !== "function") {
      throw new Error("S3 object body does not support transformToByteArray()");
    }
    return Buffer.from(await withTransform.transformToByteArray());
  }

  async deleteObject(config: OffsiteS3Config, key: string): Promise<void> {
    const client = this.buildClient(config);
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  }

  private buildClient(config: OffsiteS3Config): S3Client {
    const scheme = config.useSsl ? "https" : "http";
    return new S3Client({
      endpoint: `${scheme}://${config.endpoint}`,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  }
}
