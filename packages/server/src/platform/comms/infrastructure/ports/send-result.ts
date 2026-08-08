import { Money } from "../../../../shared/money/money";

/**
 * Common result shape every port returns on a successful send — shared by
 * `SmsPort`/`MailPort`/`PushPort` (docs/phase-3/02-communication-authentication.md
 * §1.5) so `NotificationsService` can post-process any channel's result the
 * same way (`comm_message.provider_ref`/`cost_amount`/`segments`).
 */
export interface SendResult {
  providerRef?: string;
  cost?: Money;
  segments?: number;
}
