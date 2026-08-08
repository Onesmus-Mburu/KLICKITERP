import { DomainEvent } from "./domain-event";

/**
 * Registration contract for an `obx_outbox` consumer, invoked by
 * `OutboxDispatcherService` (see that file's own doc comment for the full
 * dispatch mechanics). A handler is matched to an outbox row purely by
 * `eventType` — the dispatcher filters the full registered set on every
 * row, so registering N handlers for the same `eventType` is legal and
 * intentional (fan-out: e.g. one row could one day drive both a read-model
 * update AND a BullMQ enqueue as two separate registered handlers).
 *
 * `consumerName` is the idempotency-ledger key stored in
 * `obx_consumer_mark.consumer` (paired with the outbox row's own `id` as
 * `event_id`) — it MUST be stable across deploys/restarts (a handler that
 * changes its own `consumerName` loses its dedup history and will
 * re-process every row it already handled). Convention: a short,
 * `module.purpose` dotted name, e.g. `"comms.email-notifier"`.
 *
 * `handle()` receives the typed payload plus the full `DomainEvent`
 * envelope (event type/aggregate/occurred-at) for handlers that need
 * context beyond the payload itself. Handlers are expected to be
 * idempotent in their own right where practical (the consumer-mark ledger
 * already prevents the DISPATCHER from invoking the same handler twice for
 * the same row, but a handler that itself calls into another at-least-once
 * system, e.g. enqueuing a BullMQ job, should still guard against a
 * double-enqueue if this dispatcher's own mark-then-insert step is ever
 * interrupted between "handler ran" and "mark row committed" — see
 * `OutboxDispatcherService`'s doc comment for exactly when that window
 * exists and how a restart self-heals it).
 *
 * `OUTBOX_HANDLERS` is a plain DI token, not an Angular-style "multi"
 * provider (NestJS has no built-in equivalent) — the idiomatic Nest pattern
 * for "many providers behind one array token" is a `useFactory` that
 * injects each concrete handler class and returns them as an array (see
 * this codebase's own doc comment on `OutboxDispatcherModule` once real
 * handlers exist). `OutboxDispatcherService` injects this token with
 * `@Optional()`, defaulting to an empty array, so the dispatcher is fully
 * functional with zero registered handlers — the honest, correct state
 * this codebase is in today (2026-07-28): no `@OnEvent`/handler classes
 * exist anywhere yet, so nothing currently binds this token to anything.
 */
export interface OutboxHandler<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly eventType: string;
  readonly consumerName: string;
  handle(payload: TPayload, event: DomainEvent<TPayload>): Promise<void>;
}

export const OUTBOX_HANDLERS = Symbol("OUTBOX_HANDLERS");
