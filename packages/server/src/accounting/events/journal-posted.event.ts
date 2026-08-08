import { BaseDomainEvent } from "../../shared/events/domain-event";

export interface JournalPostedPayload extends Record<string, unknown> {
  journalId: string;
  number: string;
  periodId: string;
  sourceModule: string;
  sourceDocType: string;
  sourceDocId: string;
  journalType: string;
  postedBy: string;
}

/**
 * Published (via the shared outbox writer) whenever a MANUAL journal is
 * posted through `journals.controller.ts` (`POST /accounting/journals`) —
 * `PostingService.post()` itself stays a plain composable method (like
 * `NumberingService.allocate()`/`ApprovalEngineService.submit()`) and does
 * NOT write this event, since it takes the caller's own transaction/`EntityManager`
 * and has no `OutboxWriterService` dependency of its own; every future
 * SYSTEM-sourced posting (billing, payments, ...) is expected to write its
 * own richer domain event (e.g. `InvoicePostedEvent`) from its own service,
 * with the `gl_journal` write folded into the same transaction. No
 * subscriber exists yet for this event (same "event exists, dispatcher
 * doesn't" pattern as every other module's outbox events so far).
 */
export class JournalPostedEvent extends BaseDomainEvent<JournalPostedPayload> {
  readonly eventType = "accounting.journal_posted";
  readonly aggregateType = "gl_journal";

  constructor(journalId: string, payload: JournalPostedPayload) {
    super(journalId, payload);
  }
}
