import { request as httpsRequest } from "node:https";
import {
  AccountingSyncEntityKind,
  AccountingSyncPort,
  AccountingSyncPushResult,
  AccountingSyncTestResult,
} from "../ports/accounting-sync.port";

/**
 * Real Sage Business Cloud Accounting credentials/config, sourced from a
 * `set_integration_config` row of `kind='SAGE'` (decrypted by
 * `AccountingSyncResolverService` via `platform/settings`'
 * `IntegrationConfigService`, never read from raw env vars here — same
 * discipline `QuickBooksConfig`/`XeroConfig` follow).
 */
export interface SageConfig {
  clientId: string;
  clientSecret: string;
  /** OAuth2 refresh token from Sage's one-time authorization-code exchange (operational/deployment-time concern, same treatment `QuickBooksConfig.refreshToken`/`XeroConfig.refreshToken` document). */
  refreshToken: string;
  timeoutMs?: number;
}

const API_BASE_URL = "https://api.accounting.sage.com/v3.1";
const TOKEN_URL = "https://oauth.accounting.sage.com/token";
const DEFAULT_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
  /** Sage also rotates the refresh token on every use (like Xero) — cached in-memory for this adapter instance's lifetime, not persisted back to `set_integration_config.config_enc`, the same documented-not-solved deployment concern `XeroAdapter`'s own cache flags. */
  refreshToken: string;
}

/** Sage entity-kind -> `{path, envelopeKey}` — Sage wraps a single created resource in a singular-name envelope, e.g. `{"sales_invoice": {"id": "...", ...}}`. EXPENSE maps to `purchase_invoices`, Sage's supplier-bill resource — the closest real analog for an outbound expense record. */
const ENTITY_ENDPOINTS: Record<AccountingSyncEntityKind, { path: string; envelopeKey: string }> = {
  INVOICE: { path: "/sales_invoices", envelopeKey: "sales_invoice" },
  PAYMENT: { path: "/contact_payments", envelopeKey: "contact_payment" },
  CUSTOMER: { path: "/contacts", envelopeKey: "contact" },
  EXPENSE: { path: "/purchase_invoices", envelopeKey: "purchase_invoice" },
};

/**
 * Real, genuinely-callable `AccountingSyncPort` implementation against
 * Sage Business Cloud Accounting's public API
 * (docs/phase-3/02-communication-authentication.md §1.5) — OAuth2
 * refresh-token exchange (`oauth.accounting.sage.com/token`, client
 * credentials sent as form body per Sage's documented `client_secret_post`
 * flow, unlike QuickBooks'/Xero's HTTP Basic auth header) plus the
 * entity-create call per `pushEntity()` kind, and `/businesses` for
 * `testConnection()` (a harmless read listing the businesses this token can
 * access — Sage's closest equivalent to QuickBooks' "company info" call,
 * FR-SET-003.1's named pattern), using Node's built-in `https` module, same
 * standard `QuickBooksAdapter`/`XeroAdapter`/`DarajaAdapter` already set:
 * genuine request/response shapes per Sage's public API documentation,
 * untestable against a live account in this environment (no outbound
 * network here, docs/phase-5/PROGRESS.md "Environment status"), but not a
 * stub. Callers are expected to already shape `payload` as a valid Sage
 * entity body — this adapter transports it, it does not map/validate
 * business fields (same scope boundary `QuickBooksAdapter`/`XeroAdapter` draw).
 */
export class SageAdapter implements AccountingSyncPort {
  private tokenCache: CachedToken | null = null;

  constructor(private readonly config: SageConfig) {}

  async pushEntity(kind: AccountingSyncEntityKind, direction: "PUSH", payload: Record<string, unknown>): Promise<AccountingSyncPushResult> {
    void direction;
    const endpoint = ENTITY_ENDPOINTS[kind];
    const response = await this.postJsonAuthenticated<Record<string, unknown>>(endpoint.path, payload);
    const created = response[endpoint.envelopeKey] as { id?: string } | undefined;
    if (!created?.id) {
      throw new Error(`SageAdapter.pushEntity: unexpected response shape for ${kind} (missing ${endpoint.envelopeKey}.id)`);
    }
    return { providerRef: created.id };
  }

  async testConnection(): Promise<AccountingSyncTestResult> {
    try {
      const response = await this.getJsonAuthenticated<{ items?: Array<{ displayed_as?: string }> }>("/businesses");
      const name = response.items?.[0]?.displayed_as ?? "Sage business";
      return { ok: true, message: `Connected to Sage business "${name}"` };
    } catch (error) {
      return { ok: false, message: `Sage connection failed: ${(error as Error).message}` };
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now) {
      return this.tokenCache.accessToken;
    }

    const refreshToken = this.tokenCache?.refreshToken ?? this.config.refreshToken;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    }).toString();
    const responseText = await this.request({
      url: TOKEN_URL,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    return JSON.parse(responseText) as T;
  }

  private async getJsonAuthenticated<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const responseText = await this.request({
      url: `${API_BASE_URL}${path}`,
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
              reject(new Error(`Sage API ${url.pathname} responded ${status}: ${responseText.slice(0, 500)}`));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`Sage API ${url.pathname} timed out after ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)));
      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}
