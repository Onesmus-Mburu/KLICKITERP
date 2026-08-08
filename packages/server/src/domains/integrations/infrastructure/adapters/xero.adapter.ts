import { request as httpsRequest } from "node:https";
import {
  AccountingSyncEntityKind,
  AccountingSyncPort,
  AccountingSyncPushResult,
  AccountingSyncTestResult,
} from "../ports/accounting-sync.port";

/**
 * Real Xero credentials/config, sourced from a `set_integration_config` row
 * of `kind='XERO'` (decrypted by `AccountingSyncResolverService` via
 * `platform/settings`' `IntegrationConfigService`, never read from raw env
 * vars here — same discipline `QuickBooksConfig`/`DarajaConfig` follow).
 */
export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  /** OAuth2 refresh token from Xero's one-time authorization-code exchange (operational/deployment-time concern, same treatment `QuickBooksConfig.refreshToken` documents). */
  refreshToken: string;
  /** Xero's `Xero-tenant-id` header value — the connected organisation id, obtained via the `/connections` endpoint at setup time. */
  tenantId: string;
  timeoutMs?: number;
}

const API_BASE_URL = "https://api.xero.com/api.xro/2.0";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const DEFAULT_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
  /** Xero ROTATES the refresh token on every use (unlike QuickBooks) — kept here so this adapter instance keeps working across multiple calls within its cached lifetime; NOT persisted back to `set_integration_config.config_enc`, a real deployment-time follow-up this pass documents rather than solves (this adapter has no write path back to Settings' encrypted store). */
  refreshToken: string;
}

/** Xero entity-kind -> `{path, envelopeKey, idField}` — Xero wraps every response in a pluralized envelope array, e.g. `{"Invoices":[{"InvoiceID":"...", ...}]}`. EXPENSE has no direct "Expense" resource in Xero's API; the closest real analog for an outbound spend transaction is a `BankTransaction` of `Type=SPEND`. */
const ENTITY_ENDPOINTS: Record<AccountingSyncEntityKind, { path: string; envelopeKey: string; idField: string }> = {
  INVOICE: { path: "/Invoices", envelopeKey: "Invoices", idField: "InvoiceID" },
  PAYMENT: { path: "/Payments", envelopeKey: "Payments", idField: "PaymentID" },
  CUSTOMER: { path: "/Contacts", envelopeKey: "Contacts", idField: "ContactID" },
  EXPENSE: { path: "/BankTransactions", envelopeKey: "BankTransactions", idField: "BankTransactionID" },
};

/**
 * Real, genuinely-callable `AccountingSyncPort` implementation against
 * Xero's Accounting API (docs/phase-3/02-communication-authentication.md
 * §1.5) — OAuth2 refresh-token exchange (`identity.xero.com/connect/token`)
 * plus the entity-create call per `pushEntity()` kind, and `/Organisation`
 * for `testConnection()` (Xero's own "harmless call" equivalent to
 * QuickBooks' company-info, per FR-SET-003.1's pattern), using Node's
 * built-in `https` module, same standard `QuickBooksAdapter`/`DarajaAdapter`
 * already set: genuine request/response shapes per Xero's public API
 * documentation, untestable against a live account in this environment (no
 * outbound network here, docs/phase-5/PROGRESS.md "Environment status"), but
 * not a stub. Every outbound call carries the required `Xero-tenant-id`
 * header. Callers are expected to already shape `payload` as a valid Xero
 * entity body — this adapter transports it, it does not map/validate
 * business fields (same scope boundary `QuickBooksAdapter` draws).
 */
export class XeroAdapter implements AccountingSyncPort {
  private tokenCache: CachedToken | null = null;

  constructor(private readonly config: XeroConfig) {}

  async pushEntity(kind: AccountingSyncEntityKind, direction: "PUSH", payload: Record<string, unknown>): Promise<AccountingSyncPushResult> {
    void direction;
    const endpoint = ENTITY_ENDPOINTS[kind];
    const response = await this.postJsonAuthenticated<Record<string, unknown>>(endpoint.path, payload);
    const items = response[endpoint.envelopeKey] as Array<Record<string, unknown>> | undefined;
    const created = items?.[0];
    const id = created ? (created[endpoint.idField] as string | undefined) : undefined;
    if (!id) {
      throw new Error(`XeroAdapter.pushEntity: unexpected response shape for ${kind} (missing ${endpoint.envelopeKey}[0].${endpoint.idField})`);
    }
    return { providerRef: id };
  }

  async testConnection(): Promise<AccountingSyncTestResult> {
    try {
      const response = await this.getJsonAuthenticated<{ Organisations?: Array<{ Name?: string }> }>("/Organisation");
      const name = response.Organisations?.[0]?.Name ?? this.config.tenantId;
      return { ok: true, message: `Connected to Xero organisation "${name}"` };
    } catch (error) {
      return { ok: false, message: `Xero connection failed: ${(error as Error).message}` };
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now) {
      return this.tokenCache.accessToken;
    }

    const auth = base64(`${this.config.clientId}:${this.config.clientSecret}`);
    const refreshToken = this.tokenCache?.refreshToken ?? this.config.refreshToken;
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString();
    const responseText = await this.request({
      url: TOKEN_URL,
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const parsed = JSON.parse(responseText) as { access_token: string; refresh_token: string; expires_in: number };
    this.tokenCache = { accessToken: parsed.access_token, refreshToken: parsed.refresh_token, expiresAtMs: now + parsed.expires_in * 1000 };
    return parsed.access_token;
  }

  private async postJsonAuthenticated<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const responseText = await this.request({
      url: `${API_BASE_URL}${path}`,
      method: "POST",
      headers: this.authenticatedHeaders(token),
      body: JSON.stringify(body),
    });
    return JSON.parse(responseText) as T;
  }

  private async getJsonAuthenticated<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const responseText = await this.request({
      url: `${API_BASE_URL}${path}`,
      method: "GET",
      headers: this.authenticatedHeaders(token),
    });
    return JSON.parse(responseText) as T;
  }

  private authenticatedHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      "Xero-tenant-id": this.config.tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
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
              reject(new Error(`Xero API ${url.pathname} responded ${status}: ${responseText.slice(0, 500)}`));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`Xero API ${url.pathname} timed out after ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)));
      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}
