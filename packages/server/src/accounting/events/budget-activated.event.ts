import { BaseDomainEvent } from "../../shared/events/domain-event";

export interface BudgetActivatedPayload extends Record<string, unknown> {
  budgetId: string;
  fiscalYearId: string;
  supersededBudgetId: string | null;
  actorId: string | null;
}

/**
 * Published (via the shared outbox writer, inside the same transaction as
 * the `gl_budget` status flip) when `BudgetsService.onApprovalDecided()`
 * transitions a budget `PENDING_APPROVAL -> ACTIVE`, archiving the
 * previously-`ACTIVE` budget (if any) for the same fiscal year. Not
 * published on rejection (`PENDING_APPROVAL -> DRAFT`) — nothing new became
 * authoritative. No subscriber exists yet (same "event exists, dispatcher
 * doesn't" pattern as every other module's outbox events so far).
 */
export class BudgetActivatedEvent extends BaseDomainEvent<BudgetActivatedPayload> {
  readonly eventType = "accounting.budget_activated";
  readonly aggregateType = "gl_budget";

  constructor(budgetId: string, payload: BudgetActivatedPayload) {
    super(budgetId, payload);
  }
}
