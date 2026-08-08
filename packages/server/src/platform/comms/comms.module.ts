import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { SettingsModule } from "../settings";
import { UsersModule } from "../users";
import { BroadcastsService } from "./application/broadcasts.service";
import { DeviceTokensService } from "./application/device-tokens.service";
import { NotificationsService } from "./application/notifications.service";
import { OptoutsService } from "./application/optouts.service";
import { TemplatesService } from "./application/templates.service";
import { TriggerBindingsService } from "./application/trigger-bindings.service";
import { BroadcastsController } from "./api/broadcasts.controller";
import { DeviceTokensController } from "./api/device-tokens.controller";
import { MessagesController } from "./api/messages.controller";
import { OptoutsController } from "./api/optouts.controller";
import { TemplatesController } from "./api/templates.controller";
import { TriggerBindingsController } from "./api/trigger-bindings.controller";
import { CommBroadcastEntity } from "./domain/comm-broadcast.entity";
import { CommDeviceTokenEntity } from "./domain/comm-device-token.entity";
import { CommMessageEntity } from "./domain/comm-message.entity";
import { CommOptoutEntity } from "./domain/comm-optout.entity";
import { CommTemplateEntity } from "./domain/comm-template.entity";
import { CommTriggerBindingEntity } from "./domain/comm-trigger-binding.entity";
import { AdapterResolverService } from "./infrastructure/adapter-resolver.service";
import { LogOnlyAdapter } from "./infrastructure/adapters/log-only.adapter";
import { CommBroadcastRepository } from "./infrastructure/comm-broadcast.repository";
import { CommDeviceTokenRepository } from "./infrastructure/comm-device-token.repository";
import { CommMessageRepository } from "./infrastructure/comm-message.repository";
import { CommOptoutRepository } from "./infrastructure/comm-optout.repository";
import { CommTemplateRepository } from "./infrastructure/comm-template.repository";
import { CommTriggerBindingRepository } from "./infrastructure/comm-trigger-binding.repository";

/**
 * Imports `UsersModule`/`SettingsModule` (not just their entities) — the
 * first module in this codebase that needs a sibling platform module's
 * exported *service* at runtime, not just its entity for an FK column type:
 * `BroadcastsService` calls `UsersService.listActiveUsersByRoleId()`/
 * `.listByIds()` for `STAFF_ROLE`/`EXPLICIT_USER_IDS` audience resolution,
 * and `AdapterResolverService` calls `IntegrationConfigService.list()`/
 * `.getDecryptedConfig()` to resolve the enabled SMTP/SMS/FCM adapter. Both
 * are the sibling module's public surface only (its barrel export), per
 * module-deps.json's `platform/comms` entry — never their repositories.
 *
 * Exports only the application services (the module's public surface) —
 * repositories/adapters never leave this module.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommTemplateEntity,
      CommTriggerBindingEntity,
      CommMessageEntity,
      CommBroadcastEntity,
      CommDeviceTokenEntity,
      CommOptoutEntity,
    ]),
    UsersModule,
    SettingsModule,
  ],
  controllers: [
    TemplatesController,
    TriggerBindingsController,
    DeviceTokensController,
    OptoutsController,
    BroadcastsController,
    MessagesController,
  ],
  providers: [
    OutboxWriterService,
    CommTemplateRepository,
    CommTriggerBindingRepository,
    CommMessageRepository,
    CommBroadcastRepository,
    CommDeviceTokenRepository,
    CommOptoutRepository,
    LogOnlyAdapter,
    AdapterResolverService,
    TemplatesService,
    TriggerBindingsService,
    DeviceTokensService,
    OptoutsService,
    NotificationsService,
    BroadcastsService,
  ],
  exports: [
    TemplatesService,
    TriggerBindingsService,
    DeviceTokensService,
    OptoutsService,
    NotificationsService,
    BroadcastsService,
  ],
})
export class CommsModule {}
