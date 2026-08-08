/**
 * Base of the domain exception hierarchy. Every subclass carries a stable
 * `code` string that becomes `error.code` in the API error envelope
 * (FR-API-005.1, docs/phase-3/01-system-architecture.md §5 "Error model").
 */
export abstract class DomainException extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
