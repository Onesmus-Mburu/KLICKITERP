import { DomainException } from "./domain-exception";

export class NotFoundException extends DomainException {
  readonly code = "NOT_FOUND";
  readonly httpStatus = 404;

  constructor(entityType: string, identifier: string, details?: unknown) {
    super(`${entityType} not found: ${identifier}`, details);
  }
}
