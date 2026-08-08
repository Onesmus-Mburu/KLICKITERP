/**
 * Public barrel — the only surface any sibling/future module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Every future domain
 * module (billing, payments, procurement, payroll, journal entries, ...)
 * imports `ApprovalEngineService` from here and calls `submit()` inside its
 * own transaction, then `getStatus()` before posting — never this module's
 * repositories/infrastructure internals.
 */
export { ApprovalsModule } from "./approvals.module";

export { ApprovalEngineService } from "./application/approval-engine.service";
export type { SubmitApprovalInput } from "./application/approval-engine.service";
export { WorkflowDefinitionsService } from "./application/workflow-definitions.service";
export type { CreateWorkflowDefInput, UpdateWorkflowDefInput } from "./application/workflow-definitions.service";
export { WorkflowVersionsService } from "./application/workflow-versions.service";
export type { PublishLevelInput, PublishRoutingRuleInput } from "./application/workflow-versions.service";
export { LevelsService } from "./application/levels.service";
export type { CreateLevelInput, UpdateLevelInput } from "./application/levels.service";
export { RoutingRulesService } from "./application/routing-rules.service";
export type { CreateRoutingRuleInput, UpdateRoutingRuleInput } from "./application/routing-rules.service";
export { DelegationsService } from "./application/delegations.service";
export type { CreateDelegationInput, UpdateDelegationInput } from "./application/delegations.service";

export { ApprWorkflowDefEntity } from "./domain/appr-workflow-def.entity";
export { ApprWorkflowVersionEntity } from "./domain/appr-workflow-version.entity";
export { ApprLevelEntity, APPR_LEVEL_APPROVER_TYPES, APPR_LEVEL_MODES } from "./domain/appr-level.entity";
export type { ApprLevelApproverType, ApprLevelMode } from "./domain/appr-level.entity";
export { ApprRoutingRuleEntity } from "./domain/appr-routing-rule.entity";
export { ApprInstanceEntity } from "./domain/appr-instance.entity";
export type { ApprInstanceStatus } from "./domain/appr-instance.entity";
export { ApprActionEntity } from "./domain/appr-action.entity";
export type { ApprActionDecision } from "./domain/appr-action.entity";
export { ApprDelegationEntity } from "./domain/appr-delegation.entity";

export { ApprovalDecidedEvent } from "./events/approval-decided.event";
export type { ApprovalDecidedPayload } from "./events/approval-decided.event";
