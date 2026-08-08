import { FactoryProvider } from "@nestjs/common";
import Redis from "ioredis";
import { AppConfigService } from "../config/app-config.service";

/**
 * DI token for the shared ioredis client. Module 1 is the first consumer
 * (lockout counters, pre-auth/OTP/password-reset tokens, permission-set and
 * API-key caches — docs/phase-3/02-communication-authentication.md §2.1-2.4)
 * but the client itself is generic shared-kernel infrastructure so future
 * modules (BullMQ queues, WebSocket pub/sub) reuse the same connection
 * factory instead of each hand-rolling one.
 */
export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

export const redisClientProvider: FactoryProvider<Redis> = {
  provide: REDIS_CLIENT,
  useFactory: (config: AppConfigService): Redis => {
    return new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });
  },
  inject: [AppConfigService],
};
