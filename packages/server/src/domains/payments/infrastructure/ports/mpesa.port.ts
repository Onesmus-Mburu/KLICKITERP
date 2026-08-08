import { Money } from "../../../../shared/money/money";

/**
 * Ports & adapters boundary (docs/phase-3/02-communication-authentication.md
 * §1.5: `MpesaPort ── DarajaAdapter (STK, C2B, B2C, status, reversal;
 * sandbox|production)`). Mirrors `platform/comms`' `SmsPort`/`MailPort`/
 * `PushPort` shape exactly — one real adapter (`DarajaAdapter`, a genuine
 * Node `https`-based implementation of Safaricom's Daraja API) plus a safe
 * `MpesaLogOnlyAdapter` fallback, resolved by `MpesaAdapterResolverService`
 * against `platform/settings`' `IntegrationConfigService` (`kind='MPESA'`).
 *
 * Shapes deliberately mirror Daraja's own field names one level up (no
 * `PartyA`/`PartyB`/`CommandID` leaking into the port — those are
 * `DarajaAdapter`-internal request-building concerns), per the task's
 * specified method signatures.
 */
export interface MpesaStkPushInput {
  amountKes: Money;
  /** MSISDN in `2547XXXXXXXX` format. */
  msisdn: string;
  /** `AccountReference` — typically the student's admission number. */
  accountRef: string;
  transactionDesc?: string;
}

export interface MpesaStkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
}

export interface MpesaStkStatusResult {
  /** Daraja's `ResultCode` as a string — `"0"` means success. */
  resultCode: string;
  resultDesc: string;
}

export interface MpesaB2cPaymentInput {
  amountKes: Money;
  msisdn: string;
  remarks: string;
  occasion?: string;
}

export interface MpesaB2cPaymentResult {
  conversationId: string;
  originatorConversationId: string;
}

export interface MpesaPort {
  stkPush(input: MpesaStkPushInput): Promise<MpesaStkPushResult>;
  queryStkStatus(checkoutRequestId: string): Promise<MpesaStkStatusResult>;
  b2cPayment(input: MpesaB2cPaymentInput): Promise<MpesaB2cPaymentResult>;
}
