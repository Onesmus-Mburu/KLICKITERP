import { DomainException } from "./domain-exception";

export class ConflictException extends DomainException {
  readonly code = "CONFLICT";
  readonly httpStatus = 409;
}
