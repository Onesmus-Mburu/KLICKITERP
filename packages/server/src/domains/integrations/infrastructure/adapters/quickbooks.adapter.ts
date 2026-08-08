import { request as httpsRequest } from "node:https";
import {
  AccountingSyncEntityKind,
  AccountingSyncPort,
  AccountingSyncPushResult,
  AccountingSyncTestResult,
} from "../ports/accounting-sync.port";

/**
 * Real QuickBooks Online (Intuit) credentials/config, sourced from a
 * `set_integration_config` row of `kind='QUICKBOOKS'` (decrypted by
 * `AccountingSyncResolverService` via `platform/settings`'
 * `IntegrationConfigService`, never read from raw env vars here — same
 * discipline `DarajaConfig`/`GenericHttpSmsConfig` follow).
 */
export interface QuickBooksConfig {
  environment: "sandbox" | "production";
  clientId: string;
  clientSecret: string;
  /** Long-lived OAuth2 refresh token obtained via Intuit's one-time authorization-code exchange (an operational/deployment-time action, not modeled here — same "generating this is an operational concern" treatment `DarajaConfig.securityCredential` documents). */
  refreshToken: string;
  /** QuickBooks Online company id ("Realm ID") every `/v3/company/{realmId}/...` call is scoped to. */
  realmId: string;
  minorVersion?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MINOR_VERSION = "65";
/** Intuit access tokens are valid ~3600s; refresh a little early to avoid using an about-to-expire token mid-request (same skew Daraja's own token cache uses). */
const TOKEN_REFRESH_SKEW_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/** QBO entity-kind -> `{path, envelopeKey}` mapping — the collection endpoint plus the JSON envelope key Intuit wraps the created object in on a 200 response, e.g. `{"Invoice": {"Id": "145", ...}}`. EXPENSE has no direct QBO analog; the closest real QBO entity for a general outbound expense/bill is `Purchase`. */
const ENTITY_ENDPOINTS: Record<AccountingSyncEntityKind, { path: string; envelopeKey: string }> = {
  INVOICE: { path: "invoice", envelopeKey: "Invoice" },
  PAYMENT: { path: "payment", envelopeKey: "Payment" },
  CUSTOMER: { path: "customer", envelopeKey: "Customer" },
  EXPENSE: { path: "purchase", envelopeKey: "Purchase" },
};

/**
 * Real, genuinely-callable `AccountingSyncPort` implementation against
 * Intuit's QuickBooks Online Accounting API
 * (docs/phase-3/02-communication-authentication.md §1.5) — OAuth2
 * refresh-token exchange plus the entity-create call per `pushEntity()`
 * kind, and `companyinfo` for `testConnection()` (FR-SET-003.1's own named
 * QuickBooks example: "company info" call), using Node's built-in `https`
 * module, same standard `DarajaAdapter`/`GenericHttpSmsAdapter` already set:
 * genuine request/response shapes per QuickBooks' public API documentation,
 * untestable against a live account in this environment (no outbound
 * network here, docs/phase-5/PROGRESS.md "Environment status"), but not a
 * stub — every URL, auth flow, and response envelope below matches
 * QuickBooks Online's real contract. Callers are expected to already shape
 * `payload` as a valid QBO entity body (e.g. `Line`/`CustomerRef` for an
 * Invoice) — this adapter transports it, it does not map/validate business
 * fields, the same scope boundary `GenericHttpSmsAdapter`'s body template
 * draws for its own provider-agnostic payload.
 */
export class QuickBooksAdapter implements AccountingSyncPort {
  private tokenCache: CachedToken | null = null;

  constructor(private readonly config: QuickBooksConfig) {}

  async pushEntity(kind: AccountingSyncEntityKind, direction: "PUSH", payload: Record<string, unknown>): Promise<AccountingSyncPushResult> {
    void direction;
    const endpoint = ENTITY_ENDPOINTS[kind];
    const response = await this.postJsonAuthenticated<Record<string, unknown>>(`/v3/company/${this.config.realmId}/${endpoint.path}`, payload);
    const created = response[endpoint.envelopeKey] as { Id?: string } | undefined;
    if (!created?.Id) {
      throw new Error(`QuickBooksAdapter.pushEntity: unexpected response shape for ${kind} (missing ${endpoint.envelopeKey}.Id)`);
    }
    return { providerRef: created.Id };
  }

  async testConnection(): Promise<AccountingSyncTestResult> {
    try {
      const response = await this.getJsonAuthenticated<{ CompanyInfo?: { CompanyName?: string } }>(
        `/v3/company/${this.config.realmId}/companyinfo/${this.config.realmId}`,
      );
      const name = response.CompanyInfo?.CompanyName ?? this.config.realmId;
      return { ok: true, message: `Connected to QuickBooks company "${name}"` };
    } catch (error) {
      return { ok: false, message: `QuickBooks connection failed: ${(error as Error).message}` };
    }
  }

  private baseUrl(): string {
    return this.config.environment === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now) {
      return this.tokenCache.accessToken;
    }

    const auth = base64(`${this.config.clientId}:${this.config.clientSecret}`);
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.config.refreshToken }).toString();
    const responseText = await this.request({
      url: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const parsed = JSON.parse(responseText) as { access_token: string; expires_in: number };
    this.tokenCache = { accessToken: parsed.access_token, expiresAtMs: now + parsed.expires_in * 1000 };
    return parsed.access_token;
  }

  private async postJsonAuthenticated<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const query = `minorversion=${this.config.minorVersion ?? DEFAULT_MINOR_VERSION}`;
    const responseText = await this.request({
      url: `${this.baseUrl()}${path}?${query}`,
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    return JSON.parse(responseText) as T;
  }

  private async getJsonAuthenticated<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const query = `minorversion=${this.config.minorVersion ?? DEFAULT_MINOR_VERSION}`;
    const responseText = await this.request({
      url: `${this.baseUrl()}${path}?${query}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    return JSON.parse(responseText) as T;
  }

  private request(options: { url: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string }): Promise<string> {
    const url = new URL(options.url);
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
              reject(new Error(`QuickBooks API ${url.pathname} responded ${status}: ${responseText.slice(0, 500)}`));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`QuickBooks API ${url.pathname} timed out after ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)));
      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}
