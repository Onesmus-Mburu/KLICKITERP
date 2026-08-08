import { Injectable } from "@nestjs/common";
import { CommDevicePlatform, CommDeviceTokenEntity } from "../domain/comm-device-token.entity";
import { CommDeviceTokenRepository } from "../infrastructure/comm-device-token.repository";

export interface RegisterDeviceTokenInput {
  userId: string;
  token: string;
  platform: CommDevicePlatform;
}

/**
 * Register/unregister/list for `comm_device_token` — self-service per
 * `DeviceTokensController` (the authenticated caller registers/unregisters
 * their own tokens; `userId` always comes from the JWT, never the request
 * body). `register()` upserts by the unique `token` column: a device
 * re-registering the same push token (app reinstall, token refresh with the
 * same value, etc.) just touches `last_seen_at`/re-links `userId` rather
 * than creating a duplicate row.
 */
@Injectable()
export class DeviceTokensService {
  constructor(private readonly deviceTokenRepository: CommDeviceTokenRepository) {}

  async register(input: RegisterDeviceTokenInput, actorId: string | null): Promise<CommDeviceTokenEntity> {
    const existing = await this.deviceTokenRepository.findByToken(input.token);
    const now = new Date();

    if (existing) {
      existing.userId = input.userId;
      existing.platform = input.platform;
      existing.lastSeenAt = now;
      existing.updatedBy = actorId;
      return this.deviceTokenRepository.save(existing);
    }

    return this.deviceTokenRepository.create({
      userId: input.userId,
      token: input.token,
      platform: input.platform,
      lastSeenAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  /**
   * Deletes `token`, but only if it's currently registered to `userId` —
   * self-service unregister must not let one authenticated user delete
   * another user's token by guessing/observing its value. A no-op
   * (idempotent, no error) when the token doesn't exist or belongs to
   * someone else, so this endpoint never leaks whether a given token string
   * is registered to another account.
   */
  async unregisterOwnToken(userId: string, token: string): Promise<void> {
    const existing = await this.deviceTokenRepository.findByToken(token);
    if (!existing || existing.userId !== userId) {
      return;
    }
    await this.deviceTokenRepository.deleteByToken(token);
  }

  async listByUser(userId: string): Promise<CommDeviceTokenEntity[]> {
    return this.deviceTokenRepository.listByUser(userId);
  }
}
