import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Money } from "../../../../shared/money/money";
import { SendResult } from "../ports/send-result";
import { SmsPort } from "../ports/sms.port";

/**
 * Provider-agnostic HTTP SMS gateway config, sourced from a
 * `set_integration_config` row of `kind='SMS'` (decrypted by
 * `AdapterResolverService` via `platform/settings`' `IntegrationConfigService`,
 * never read from raw env vars here).
 */
export interface GenericHttpSmsConfig {
  /** Full URL the SMS gateway exposes, e.g. `https://gateway.example.com/v1/send`. */
  endpoint: string;
  method?: "POST" | "PUT";
  /** e.g. "Authorization" / "X-Api-Key" — omitted entirely when the gateway needs no auth header. */
  authHeaderName?: string;
  authHeaderValue?: string;
  /**
   * JSON body template with `{{recipient}}`/`{{body}}` placeholders,
   * substituted (as JSON-escaped string values) before the request is sent —
   * e.g. `{"to":"{{recipient}}","message":"{{body}}","from":"KLICKIT"}`.
   * Defaults to `{"to":"{{recipient}}","message":"{{body}}"}` when omitted.
   */
  bodyTemplate?: string;
  /** Dot-path into the parsed JSON response carrying the provider's message/reference id, e.g. "data.messageId". Omit if the provider's response has none worth capturing. */
  providerRefPath?: string;
  /** Dot-path into the parsed JSON response carrying a numeric per-message cost, in the gateway's own currency units. */
  costPath?: string;
  /** Dot-path into the parsed JSON response carrying the SMS segment count. */
  segmentsPath?: string;
  timeoutMs?: number;
}

const DEFAULT_BODY_TEMPLATE = `{"to":"{{recipient}}","message":"{{body}}"}`;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Real, generic HTTP-POST-based `SmsPort` implementation — configurable
 * endpoint/method/auth-header/body-template, all sourced from Settings'
 * `set_integration_config` (kind=`SMS`). Genuinely callable code (uses
 * Node's built-in `http`/`https` modules, no mocking), even though it can't
 * be exercised against a live provider in this environment
 * (docs/phase-5/PROGRESS.md "Environment status" — no outbound network in
 * CI/dev here either). docs/phase-3/02-communication-authentication.md
 * §1.5 names this as one of `SmsPort`'s two shipped adapters.
 */
export class GenericHttpSmsAdapter implements SmsPort {
  constructor(private readonly config: GenericHttpSmsConfig) {}

  async send(recipient: string, body: string): Promise<SendResult> {
    const payload = this.buildBody(recipient, body);
    const responseText = await this.postJson(payload);
    const parsed = safeParseJson(responseText);

    return {
      providerRef: this.config.providerRefPath ? readPath(parsed, this.config.providerRefPath) : undefined,
      cost: this.config.costPath ? this.readCost(parsed, this.config.costPath) : undefined,
      segments: this.config.segmentsPath ? this.readNumber(parsed, this.config.segmentsPath) : undefined,
    };
  }

  private buildBody(recipient: string, body: string): string {
    const template = this.config.bodyTemplate ?? DEFAULT_BODY_TEMPLATE;
    return template
      .replaceAll("{{recipient}}", jsonEscape(recipient))
      .replaceAll("{{body}}", jsonEscape(body));
  }

  private readCost(parsed: unknown, path: string): Money | undefined {
    const value = readPath(parsed, path);
    if (value === undefined || value === null || value === "") return undefined;
    return Money.fromDecimalString(String(value));
  }

  private readNumber(parsed: unknown, path: string): number | undefined {
    const value = readPath(parsed, path);
    if (value === undefined || value === null || value === "") return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private postJson(payload: string): Promise<string> {
    const url = new URL(this.config.endpoint);
    const isHttps = url.protocol === "https:";
    const doRequest = isHttps ? httpsRequest : httpRequest;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload).toString(),
    };
    if (this.config.authHeaderName && this.config.authHeaderValue) {
      headers[this.config.authHeaderName] = this.config.authHeaderValue;
    }

    return new Promise<string>((resolve, reject) => {
      const req = doRequest(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: this.config.method ?? "POST",
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
              reject(new Error(`SMS gateway responded ${status}: ${responseText.slice(0, 500)}`));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`SMS gateway request timed out after ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)));
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }
}

function jsonEscape(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Reads a `a.b.c`-style dot-path out of a parsed JSON value; returns `undefined` if any segment is missing. */
function readPath(value: unknown, path: string): string | undefined {
  let cursor: unknown = value;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor === undefined || cursor === null ? undefined : String(cursor);
}
