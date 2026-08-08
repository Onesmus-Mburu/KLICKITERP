/**
 * Typed domain event contract. Written to the transactional outbox inside
 * the business transaction that produced it (docs/phase-3/02-communication-authentication.md
 * §1.3) — an event exists iff its transaction committed.
 */
export interface DomainEvent<TPayload = Record<string, unknown>> {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: TPayload;
  readonly occurredAt: Date;
}

export abstract class BaseDomainEvent<TPayload = Record<string, unknown>>
  implements DomainEvent<TPayload>
{
  abstract readonly eventType: string;
  abstract readonly aggregateType: string;
  readonly occurredAt: Date = new Date();

  protected constructor(
    readonly aggregateId: string,
    readonly payload: TPayload,
  ) {}
}
