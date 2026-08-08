import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { generateUuidV7 } from "../ids/uuid7";
import { DomainException } from "./domain-exception";
import { ErrorEnvelope } from "./error-envelope";

/**
 * Minimal request/response shapes instead of pulling in `@types/express`:
 * this filter only ever needs headers in, status+json out, and both Express
 * and Fastify adapters satisfy this surface.
 */
interface MinimalRequest {
  headers?: Record<string, string | string[] | undefined>;
}

interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): MinimalResponse;
}

const GENERIC_ERROR_CODE = "INTERNAL_ERROR";

/**
 * Maps every thrown value (DomainException hierarchy, NestJS HttpException,
 * or an unexpected error) into the FR-API-005.1 error envelope. `request_id`
 * is read from the inbound header (set by Nginx per
 * docs/phase-3/01-system-architecture.md §5) and generated as a fallback.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<MinimalResponse>();
    const request = ctx.getRequest<MinimalRequest>();

    const requestId = this.resolveRequestId(request);
    const mapped = this.mapException(exception);

    if (mapped.status >= 500) {
      this.logger.error(
        `[${requestId}] ${mapped.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const envelope: ErrorEnvelope = {
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details,
      },
      request_id: requestId,
    };

    response.status(mapped.status).json(envelope);
  }

  private resolveRequestId(request: MinimalRequest): string {
    const header = request?.headers?.["x-request-id"];
    if (typeof header === "string" && header.length > 0) {
      return header;
    }
    if (Array.isArray(header) && header.length > 0 && header[0]) {
      return header[0];
    }
    return generateUuidV7();
  }

  private mapException(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof DomainException) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const rawMessage =
        typeof body === "string"
          ? body
          : ((body as { message?: string | string[] } | undefined)?.message ??
            exception.message);

      return {
        status,
        code: this.httpStatusToCode(status),
        message: Array.isArray(rawMessage) ? rawMessage.join("; ") : rawMessage,
        details: typeof body === "object" ? body : undefined,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: GENERIC_ERROR_CODE,
      message: exception instanceof Error ? exception.message : "Unexpected error",
    };
  }

  private httpStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHENTICATED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "VALIDATION_ERROR";
      default:
        return GENERIC_ERROR_CODE;
    }
  }
}
