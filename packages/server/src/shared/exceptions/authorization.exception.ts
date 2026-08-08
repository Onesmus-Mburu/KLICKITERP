import { DomainException } from "./domain-exception";

export class AuthorizationException extends DomainException {
  readonly code = "FORBIDDEN";
  readonly httpStatus = 403;
}
