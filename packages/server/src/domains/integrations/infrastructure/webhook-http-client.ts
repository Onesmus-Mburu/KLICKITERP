import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Injectable } from "@nestjs/common";

const DEFAULT_TIMEOUT_MS = 10_000;

export class WebhookHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
  ) {
    super(message);
  }
}

/**
 * Real, genuinely-callable outbound POST for `WebhookDeliveryService.attemptDelivery()`
 * — pulled into its own injectable class (rather than inlined as a private
 * method, the way `DarajaAdapter`/`GenericHttpSmsAdapter` inline theirs)
 * specifically so unit tests can inject a mock in place of Node's real
 * `http`/`https` modules and assert `attemptDelivery()`'s status-transition
 * logic (backoff schedule progression, `DEAD` at attempt 8, the 72h
 * auto-disable trigger) deterministically, without any real network I/O.
 * Uses Node's built-in `http`/`https` modules, same standard every other
 * real adapter in this codebase already sets — genuinely callable, even
 * though it can't be exercised against a live subscriber endpoint in this
 * environment (docs/phase-5/PROGRESS.md "Environment status").
 */
@Injectable()
export class WebhookHttpClient {
  post(url: string, body: string, signatureHeader: string): Promise<number> {
    const target = new URL(url);
    const isHttps = target.protocol === "https:";
    const doRequest = isHttps ? httpsRequest : httpRequest;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
      "X-Klickit-Signature": signatureHeader,
    };

    return new Promise<number>((resolve, reject) => {
      const req = doRequest(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (isHttps ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          method: "POST",
          headers,
          timeout: DEFAULT_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) {
              resolve(status);
            } else {
              const responseText = Buffer.concat(chunks).toString("utf8");
              reject(new WebhookHttpError(`Webhook target responded ${status}: ${responseText.slice(0, 500)}`, status));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new WebhookHttpError(`Webhook target timed out after ${DEFAULT_TIMEOUT_MS}ms`, null)));
      req.on("error", (error) => reject(new WebhookHttpError(error.message, null)));
      req.write(body);
      req.end();
    });
  }
}
