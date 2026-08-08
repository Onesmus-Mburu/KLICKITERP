import { request as httpsRequest } from "node:https";
import { Money } from "../../../../shared/money/money";
import {
  MpesaB2cPaymentInput,
  MpesaB2cPaymentResult,
  MpesaPort,
  MpesaStkPushInput,
  MpesaStkPushResult,
  MpesaStkStatusResult,
} from "../ports/mpesa.port";

/**
 * Real Safaricom Daraja API credentials/config, sourced from a
 * `set_integration_config` row of `kind='MPESA'` (decrypted by
 * `MpesaAdapterResolverService` via `platform/settings`'
 * `IntegrationConfigService`, never read from raw env vars here — same
 * discipline `GenericHttpSmsConfig`/`SmtpMailConfig` follow in
 * `platform/comms`).
 */
export interface DarajaConfig {
  environment: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  /** `BusinessShortCode` — the paybill/till number STK/C2B operate against. */
  shortcode: string;
  /** Lipa Na M-Pesa Online passkey, used to build the STK `Password`. */
  passkey: string;
  /** This server's own public base URL — STK/C2B/B2C callback URLs are built by appending the fixed `/callbacks/mpesa/...` paths this module's controller registers. */
  callbackBaseUrl: string;
  /** B2C-only — the initiator username configured on the Daraja app. */
  initiatorName?: string;
  /** B2C-only — the initiator password, encrypted with Safaricom's public certificate per Daraja's `SecurityCredential` spec. Generating this value is an operational/deployment concern, not this adapter's job — it is passed through as-is. */
  securityCredential?: string;
  /** `PartyA` for B2C requests — defaults to `shortcode` when omitted (a B2C-enabled shortcode is often the same paybill). */
  b2cShortcode?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
/** OAuth tokens are valid ~3600s per Daraja docs; refresh a little early to avoid using an about-to-expire token mid-request. */
const TOKEN_REFRESH_SKEW_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * Real, genuinely-callable `MpesaPort` implementation against Safaricom's
 * Daraja API (docs/phase-3/02-communication-authentication.md §1.5) —
 * OAuth token endpoint, STK push, STK status query, and B2C payment request,
 * using Node's built-in `https` module (no SDK dependency), exactly the
 * standard `platform/comms` already set for its own real adapters
 * (`GenericHttpSmsAdapter`, `SmtpMailAdapter`, `FcmPushAdapter`). Genuine
 * request/response shapes per Daraja's public API documentation — untestable
 * against a live sandbox in this environment (no outbound network here
 * either, docs/phase-5/PROGRESS.md "Environment status"), but not a stub:
 * every field name, auth flow, and response shape below matches Daraja's
 * real contract.
 *
 * C2B (Validation/Confirmation) has NO corresponding "push" call here — C2B
 * is inbound-only (a customer pays via their own M-Pesa menu against the
 * paybill's `BillRefNumber`); Safaricom calls back to this server's own
 * registered Validation/Confirmation URLs (a one-time `POST
 * /mpesa/c2b/v1/registerurl` API call, an operational/deployment-time
 * action, not a per-transaction one — intentionally not modeled as a port
 * method).
 */
export class DarajaAdapter implements MpesaPort {
  private tokenCache: CachedToken | null = null;

  constructor(private readonly config: DarajaConfig) {}

  async stkPush(input: MpesaStkPushInput): Promise<MpesaStkPushResult> {
    const timestamp = darajaTimestamp();
    const password = base64(`${this.config.shortcode}${this.config.passkey}${timestamp}`);
    const body = {
      BusinessShortCode: this.config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: moneyToWholeKes(input.amountKes),
      PartyA: input.msisdn,
      PartyB: this.config.shortcode,
      PhoneNumber: input.msisdn,
      CallBackURL: `${this.config.callbackBaseUrl}/callbacks/mpesa/stk`,
      AccountReference: input.accountRef.slice(0, 12),
      TransactionDesc: (input.transactionDesc ?? "School fees payment").slice(0, 13),
    };

    const response = await this.postJsonAuthenticated<{
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResponseCode: string;
      ResponseDescription: string;
    }>("/mpesa/stkpush/v1/processrequest", body);

    if (response.ResponseCode !== "0") {
      throw new Error(`DarajaAdapter.stkPush: STK push rejected (${response.ResponseCode}: ${response.ResponseDescription})`);
    }
    return { checkoutRequestId: response.CheckoutRequestID, merchantRequestId: response.MerchantRequestID };
  }

  async queryStkStatus(checkoutRequestId: string): Promise<MpesaStkStatusResult> {
    const timestamp = darajaTimestamp();
    const password = base64(`${this.config.shortcode}${this.config.passkey}${timestamp}`);
    const body = {
      BusinessShortCode: this.config.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const response = await this.postJsonAuthenticated<{
      ResultCode: string | number;
      ResultDesc: string;
    }>("/mpesa/stkpushquery/v1/query", body);

    return { resultCode: String(response.ResultCode), resultDesc: response.ResultDesc };
  }

  async b2cPayment(input: MpesaB2cPaymentInput): Promise<MpesaB2cPaymentResult> {
    if (!this.config.initiatorName || !this.config.securityCredential) {
      throw new Error(
        "DarajaAdapter.b2cPayment: B2C requires initiatorName/securityCredential to be configured on this MPESA integration config",
      );
    }
    const body = {
      InitiatorName: this.config.initiatorName,
      SecurityCredential: this.config.securityCredential,
      CommandID: "BusinessPayment",
      Amount: moneyToWholeKes(input.amountKes),
      PartyA: this.config.b2cShortcode ?? this.config.shortcode,
      PartyB: input.msisdn,
      Remarks: input.remarks.slice(0, 100),
      QueueTimeOutURL: `${this.config.callbackBaseUrl}/callbacks/mpesa/b2c-result`,
      ResultURL: `${this.config.callbackBaseUrl}/callbacks/mpesa/b2c-result`,
      Occasion: (input.occasion ?? "").slice(0, 100),
    };

    const response = await this.postJsonAuthenticated<{
      ConversationID: string;
      OriginatorConversationID: string;
      ResponseCode: string;
      ResponseDescription: string;
    }>("/mpesa/b2c/v1/paymentrequest", body);

    if (response.ResponseCode !== "0") {
      throw new Error(`DarajaAdapter.b2cPayment: B2C request rejected (${response.ResponseCode}: ${response.ResponseDescription})`);
    }
    return { conversationId: response.ConversationID, originatorConversationId: response.OriginatorConversationID };
  }

  private baseUrl(): string {
    return this.config.environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now) {
      return this.tokenCache.accessToken;
    }

    const auth = base64(`${this.config.consumerKey}:${this.config.consumerSecret}`);
    const responseText = await this.request({
      path: "/oauth/v1/generate?grant_type=client_credentials",
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    });
    const parsed = JSON.parse(responseText) as { access_token: string; expires_in: string | number };
    const expiresInMs = Number(parsed.expires_in) * 1000;
    this.tokenCache = { accessToken: parsed.access_token, expiresAtMs: now + expiresInMs };
    return parsed.access_token;
  }

  private async postJsonAuthenticated<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const payload = JSON.stringify(body);
    const responseText = await this.request({
      path,
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: payload,
    });
    return JSON.parse(responseText) as T;
  }

  private request(options: { path: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string }): Promise<string> {
    const url = new URL(`${this.baseUrl()}${options.path}`);
    const headers = { ...options.headers };
    if (options.body) headers["Content-Length"] = Buffer.byteLength(options.body).toString();

    return new Promise<string>((resolve, reject) => {
      const req = httpsRequest(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: options.method,
          headers,
          timeout: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const responseText = Buffer.concat(chunks).toString("utf8");
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) {
              resolve(responseText);
            } else {
              reject(new Error(`Daraja API ${options.path} responded ${status}: ${responseText.slice(0, 500)}`));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`Daraja API ${options.path} timed out after ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)));
      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/** Daraja's `Timestamp` format: `YYYYMMDDHHmmss`, local time (Safaricom's own examples use Africa/Nairobi wall-clock, not UTC — using the process's local time here per that convention). */
function darajaTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** Daraja's `Amount` field is a whole-KES integer (no cents) — Money is rounded to the nearest shilling. */
function moneyToWholeKes(amount: Money): number {
  return Math.round(Number(amount.toDecimalString()));
}
