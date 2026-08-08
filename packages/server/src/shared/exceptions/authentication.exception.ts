import { DomainException } from "./domain-exception";

export class AuthenticationException extends DomainException {
  readonly code = "UNAUTHENTICATED";
  readonly httpStatus = 401;
}
