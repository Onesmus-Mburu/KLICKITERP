import { DomainException } from "./domain-exception";

export class ValidationException extends DomainException {
  readonly code = "VALIDATION_ERROR";
  readonly httpStatus = 422;
}
