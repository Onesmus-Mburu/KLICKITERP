import { Injectable, Logger } from "@nestjs/common";
import { ApiCallDirection } from "../domain/api-call-log.entity";
import { ApiCallLogRepository } from "../infrastructure/api-call-log.repository";

/**
 * BR-LIC-04 — every `/license/v1/*` call is logged school-visibly, both
 * directions, full request/response bodies. Implemented as an explicit
 * `wrap()` call at each `license-api.controller.ts` handler's own call
 * site, rather than a NestJS interceptor: by the time a handler runs, the
 * guard has already produced the verified inbound claims (including the
 * `kid` that identifies the caller) — a `wrap()` invoked with that
 * already-verified context in hand is simpler than an interceptor
 * reconstructing it from `ExecutionContext` after the fact, and is just as
 * centralizing for BR-LIC-04's purposes (one call site, not nine
 * copy-pasted try/finally blocks).
 */
@Injectable()
export class ApiCallLoggerService {
  private readonly logger = new Logger(ApiCallLoggerService.name);

  constructor(private readonly repository: ApiCallLogRepository) {}

  async logInbound(endpoint: string, callerKeyId: string | null, requestBody: unknown): Promise<void> {
    await this.write("IN", endpoint, callerKeyId, requestBody);
  }

  async logOutbound(endpoint: string, callerKeyId: string | null, responseBody: unknown): Promise<void> {
    await this.write("OUT", endpoint, callerKeyId, responseBody);
  }

  /** Logs the inbound call, runs `handler`, logs the outbound result (or the thrown error's message, still a logged response) — rethrows on failure. */
  async wrap<T>(endpoint: string, callerKeyId: string | null, requestBody: unknown, handler: () => Promise<T>): Promise<T> {
    await this.logInbound(endpoint, callerKeyId, requestBody);
    try {
      const result = await handler();
      await this.logOutbound(endpoint, callerKeyId, result);
      return result;
    } catch (error) {
      await this.logOutbound(endpoint, callerKeyId, { error: (error as Error).message });
      throw error;
    }
  }

  private async write(direction: ApiCallDirection, endpoint: string, callerKeyId: string | null, body: unknown): Promise<void> {
    try {
      await this.repository.create({
        direction,
        endpoint,
        requestBody: direction === "IN" ? (body ?? null) : null,
        responseBody: direction === "OUT" ? (body ?? null) : null,
        callerKeyId,
        at: new Date(),
      });
    } catch (error) {
      // BR-LIC-04's log must never be the reason a licensing call itself fails.
      this.logger.error(`Failed to write license.api_call_log row for "${endpoint}" (${direction}): ${(error as Error).message}`);
    }
  }
}
