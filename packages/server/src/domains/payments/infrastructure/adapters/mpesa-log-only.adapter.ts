import { Injectable, Logger } from "@nestjs/common";
import { generateUuidV7 } from "../../../../shared/ids/uuid7";
import {
  MpesaB2cPaymentInput,
  MpesaB2cPaymentResult,
  MpesaPort,
  MpesaStkPushInput,
  MpesaStkPushResult,
  MpesaStkStatusResult,
} from "../ports/mpesa.port";

/**
 * Safe default `MpesaPort` implementation — mirrors `platform/comms`'
 * `LogOnlyAdapter` exactly. `MpesaAdapterResolverService` falls back to this
 * whenever no `set_integration_config` row of `kind='MPESA'` is enabled, so
 * `MpesaService` always has a working (if inert) port to call, even with
 * zero M-Pesa credentials configured. Every result carries a synthetic,
 * clearly-tagged reference so downstream logic (idempotency keys, GL memo
 * lines) never breaks on an undefined value.
 */
@Injectable()
export class MpesaLogOnlyAdapter implements MpesaPort {
  private readonly logger = new Logger(MpesaLogOnlyAdapter.name);

  async stkPush(input: MpesaStkPushInput): Promise<MpesaStkPushResult> {
    this.logger.log(
      `[mpesa log-only] STK push -> ${input.msisdn} KES ${input.amountKes.toDecimalString()} (ref=${input.accountRef})`,
    );
    return { checkoutRequestId: `log-checkout-${generateUuidV7()}`, merchantRequestId: `log-merchant-${generateUuidV7()}` };
  }

  async queryStkStatus(checkoutRequestId: string): Promise<MpesaStkStatusResult> {
    this.logger.log(`[mpesa log-only] STK status query -> ${checkoutRequestId}`);
    return { resultCode: "1", resultDesc: "log-only fallback — no real M-Pesa integration configured, still pending" };
  }

  async b2cPayment(input: MpesaB2cPaymentInput): Promise<MpesaB2cPaymentResult> {
    this.logger.log(
      `[mpesa log-only] B2C payment -> ${input.msisdn} KES ${input.amountKes.toDecimalString()} (${input.remarks})`,
    );
    return { conversationId: `log-conv-${generateUuidV7()}`, originatorConversationId: `log-orig-conv-${generateUuidV7()}` };
  }
}
