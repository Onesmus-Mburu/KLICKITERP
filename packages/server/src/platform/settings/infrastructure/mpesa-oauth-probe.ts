import { request as httpsRequest } from "node:https";

/**
 * Phase 6 Slice 7 — the minimal real Daraja OAuth token-fetch call, used ONLY
 * by `IntegrationConfigService.testConnection()`'s `MPESA` branch (FR-SET-003.1
 * "Test Connection button exercising a real harmless call") — a genuine,
 * harmless, read-only probe (Safaricom's own OAuth token endpoint), never a
 * real transaction (no STK/B2C call is ever made from here).
 *
 * **Why this duplicates, rather than reuses,
 * `domains/payments/infrastructure/adapters/daraja.adapter.ts`'s own
 * `getAccessToken()`**: `module-deps.json`'s `platform/settings` entry
 * declares `mayImport: ["shared"]` only — platform modules may depend on the
 * shared kernel alone; importing `DarajaAdapter` (a `domains/payments`
 * class) from here would add a NEW backward dependency edge (a platform
 * module reaching INTO a domain module), which is the direction this
 * codebase's whole module-dependency architecture forbids (domains depend on
 * platform, never the reverse — architecture doc §3.3 rule 2; every other
 * platform module's own `mayImport` entry stays within `shared`/sibling
 * `platform/*` for exactly this reason). `MpesaAdapterResolverService`'s own
 * construction logic (`new DarajaAdapter(config)`) was checked first, per
 * the plan's own instruction to prefer reuse — it is NOT cleanly reusable
 * without that awkward, architecture-violating coupling, so this is a
 * deliberate, narrowly-scoped duplication of ONLY the OAuth-token-fetch call
 * (~25 lines) — not the full adapter (STK push/status query/B2C payment stay
 * domain-owned in `domains/payments`, completely untouched by this pass).
 */
export interface MpesaOAuthProbeConfig {
  environment: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Resolves with the raw access token on a genuine 2xx Daraja response; rejects on any non-2xx status, timeout, or transport error — the caller (`IntegrationConfigService.testMpesaConnection()`) turns either outcome into a `TestConnectionResult`. */
export function fetchDarajaOAuthToken(config: MpesaOAuthProbeConfig): Promise<string> {
  const baseUrl = config.environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const url = new URL(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`);
  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`, "utf8").toString("base64");

  return new Promise<string>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
        timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const responseText = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Daraja OAuth token endpoint responded ${status}: ${responseText.slice(0, 300)}`));
            return;
          }
          try {
            const parsed = JSON.parse(responseText) as { access_token?: string };
            if (!parsed.access_token) {
              reject(new Error(`Daraja OAuth token endpoint responded 2xx but no access_token was present: ${responseText.slice(0, 300)}`));
              return;
            }
            resolve(parsed.access_token);
          } catch {
            reject(new Error(`Daraja OAuth token endpoint returned unparseable JSON: ${responseText.slice(0, 300)}`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Daraja OAuth token endpoint timed out after ${config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)));
    req.on("error", reject);
    req.end();
  });
}
