import { BaseDomainEvent } from "../../../shared/events/domain-event";
import { ApprActionDecision } from "../domain/appr-action.entity";
import { ApprInstanceStatus } from "../domain/appr-instance.entity";

export interface ApprovalDecidedPayload extends Record<string, unknown> {
  instanceId: string;
  domainCode: string;
  entityType: string;
  entityId: string;
  levelSeq: number;
  actorId: string;
  /** `"CANCEL"` covers `ApprovalEngineService.cancel()` — not a recorded `appr_action` decision, but still a terminal transition worth announcing. */
  decision: ApprActionDecision | "CANCEL";
  resultingStatus: ApprInstanceStatus;
  wasDelegatedFrom: string | null;
}

/**
 * Published (via the shared outbox writer, inside the same transaction as
 * the `appr_instance`/`appr_action` write) on every APPROVE/REJECT/RETURN
 * decision recorded by `ApprovalEngineService.decide()`, and on `.cancel()`.
 * The future comms module trigger-binding dispatcher ("Approval
 * Required"/"Expense Approved" etc., `comm_trigger_binding`) is the intended
 * subscriber once a dispatcher exists — no such dispatcher exists yet in
 * this codebase (same "config/event exists, dispatcher doesn't" pattern as
 * `comm_trigger_binding` itself, see Module 5's design notes).
 */
export class ApprovalDecidedEvent extends BaseDomainEvent<ApprovalDecidedPayload> {
  readonly eventType = "approval.decided";
  readonly aggregateType = "appr_instance";

  constructor(instanceId: string, payload: ApprovalDecidedPayload) {
    super(instanceId, payload);
  }
}
