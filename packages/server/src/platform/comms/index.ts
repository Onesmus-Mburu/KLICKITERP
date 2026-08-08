/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). A future module
 * (e.g. billing, payroll) wanting to send a notification imports
 * `NotificationsService` from here and calls `.send()` — never this
 * module's repositories/adapters directly.
 */
export { CommsModule } from "./comms.module";
export { TemplatesService } from "./application/templates.service";
export type { CreateTemplateInput, RenderedTemplate, UpdateTemplateInput } from "./application/templates.service";
export { TriggerBindingsService } from "./application/trigger-bindings.service";
export type {
  CreateTriggerBindingInput,
  UpdateTriggerBindingInput,
} from "./application/trigger-bindings.service";
export { DeviceTokensService } from "./application/device-tokens.service";
export type { RegisterDeviceTokenInput } from "./application/device-tokens.service";
export { OptoutsService } from "./application/optouts.service";
export type { CreateOptoutInput } from "./application/optouts.service";
export { NotificationsService } from "./application/notifications.service";
export type { SendMessageInput } from "./application/notifications.service";
export { BroadcastsService } from "./application/broadcasts.service";
export type { AudienceDef, CreateBroadcastInput } from "./application/broadcasts.service";

export { CommTemplateEntity, COMM_CHANNELS } from "./domain/comm-template.entity";
export type { CommChannel } from "./domain/comm-template.entity";
export { CommTriggerBindingEntity } from "./domain/comm-trigger-binding.entity";
export { CommMessageEntity } from "./domain/comm-message.entity";
export type { CommMessageStatus } from "./domain/comm-message.entity";
export { CommBroadcastEntity } from "./domain/comm-broadcast.entity";
export type { CommBroadcastStatus } from "./domain/comm-broadcast.entity";
export { CommDeviceTokenEntity } from "./domain/comm-device-token.entity";
export type { CommDevicePlatform } from "./domain/comm-device-token.entity";
export { CommOptoutEntity } from "./domain/comm-optout.entity";

export type { MailPort } from "./infrastructure/ports/mail.port";
export type { PushPort } from "./infrastructure/ports/push.port";
export type { SmsPort } from "./infrastructure/ports/sms.port";
export type { SendResult } from "./infrastructure/ports/send-result";
