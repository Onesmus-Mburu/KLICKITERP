import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { decryptFromBuffer, encryptToBuffer } from "../../../shared/crypto/aes-gcm.util";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { SetSettingEntity } from "../domain/set-setting.entity";
import { SetSettingRepository } from "../infrastructure/set-setting.repository";

/** Placeholder shown in `list()` output for `is_secret=true` rows — never the real ciphertext or plaintext. */
const REDACTED_SECRET_VALUE = "***";

export interface SettingListItem {
  key: string;
  value: unknown;
  isSecret: boolean;
}

/**
 * Generic key/value settings store (FR-SET-003.1). `set_setting.value` is
 * opaque jsonb; when `is_secret=true` the value stored in the column is an
 * AES-256-GCM envelope (see `set-setting.entity.ts`'s doc comment) —
 * encrypted on write, decrypted on read, entirely inside this service.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly settingRepository: SetSettingRepository,
    private readonly config: AppConfigService,
  ) {}

  /** Returns `null` if the key doesn't exist, decrypting transparently when `is_secret=true`. */
  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await this.settingRepository.findByKey(key);
    if (!row) return null;
    return this.decode<T>(row);
  }

  /** Same as `get`, but throws `NotFoundException` unless a `defaultValue` is supplied. */
  async getTyped<T>(key: string, defaultValue?: T): Promise<T> {
    const value = await this.get<T>(key);
    if (value === null) {
      if (defaultValue !== undefined) return defaultValue;
      throw new NotFoundException("Setting", key);
    }
    return value;
  }

  /** Secret values are redacted, never returned in bulk-list form (even encrypted). */
  async list(): Promise<SettingListItem[]> {
    const rows = await this.settingRepository.list();
    return rows.map((row) => ({
      key: row.key,
      value: row.isSecret ? REDACTED_SECRET_VALUE : row.value,
      isSecret: row.isSecret,
    }));
  }

  /** Upsert by `key` (FR-SET-003.1). `isSecret=true` encrypts `value` before it ever reaches the repository. */
  async set(key: string, value: unknown, isSecret: boolean, actorId: string | null): Promise<SetSettingEntity> {
    const storedValue = isSecret ? this.encode(value) : value;
    const existing = await this.settingRepository.findByKey(key);

    if (existing) {
      existing.value = storedValue;
      existing.isSecret = isSecret;
      existing.updatedBy = actorId;
      return this.settingRepository.save(existing);
    }

    return this.settingRepository.create({
      key,
      value: storedValue,
      isSecret,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  private encode(value: unknown): string {
    return encryptToBuffer(JSON.stringify(value), this.config.appEncryptionKeyBase64).toString("base64");
  }

  private decode<T>(row: SetSettingEntity): T {
    if (!row.isSecret) return row.value as T;
    const ciphertext = Buffer.from(row.value as string, "base64");
    return JSON.parse(decryptFromBuffer(ciphertext, this.config.appEncryptionKeyBase64)) as T;
  }
}
