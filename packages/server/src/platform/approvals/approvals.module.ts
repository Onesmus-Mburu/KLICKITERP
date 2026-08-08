import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { UsersModule } from "../users";
import { ApprovalEngineService } from "./application/approval-engine.service";
import { DelegationsService } from "./application/delegations.service";
import { LevelsService } from "./application/levels.service";
import { RoutingRulesService } from "./application/routing-rules.service";
import { WorkflowDefinitionsService } from "./application/workflow-definitions.service";
import { WorkflowVersionsService } from "./application/workflow-versions.service";
import { DelegationsController } from "./api/delegations.controller";
import { InstancesController } from "./api/instances.controller";
import { WorkflowDefinitionsController } from "./api/workflow-definitions.controller";
import { WorkflowVersionsController } from "./api/workflow-versions.controller";
import { ApprActionEntity } from "./domain/appr-action.entity";
import { ApprDelegationEntity } from "./domain/appr-delegation.entity";
import { ApprInstanceEntity } from "./domain/appr-instance.entity";
import { ApprLevelEntity } from "./domain/appr-level.entity";
import { ApprRoutingRuleEntity } from "./domain/appr-routing-rule.entity";
import { ApprWorkflowDefEntity } from "./domain/appr-workflow-def.entity";
import { ApprWorkflowVersionEntity } from "./domain/appr-workflow-version.entity";
import { ApprActionRepository } from "./infrastructure/appr-action.repository";
import { ApprDelegationRepository } from "./infrastructure/appr-delegation.repository";
import { ApprInstanceRepository } from "./infrastructure/appr-instance.repository";
import { ApprLevelRepository } from "./infrastructure/appr-level.repository";
import { ApprRoutingRuleRepository } from "./infrastructure/appr-routing-rule.repository";
import { ApprWorkflowDefRepository } from "./infrastructure/appr-workflow-def.repository";
import { ApprWorkflowVersionRepository } from "./infrastructure/appr-workflow-version.repository";

/**
 * Imports `UsersModule` (not just its entities) — `ApprovalEngineService`
 * calls `UsersService.findByIdOrFail()`/`.listActiveUsersByRoleId()` and
 * `DepartmentsService.findByIdOrFail()` at runtime, both the sibling
 * module's public surface only (its barrel export `../users`), per
 * `module-deps.json`'s `platform/approvals` entry. `UsersService.hasRole()`
 * was also added for this module (same precedent as comms' `listByIds()`/
 * `listActiveUsersByRoleId()` additions) but ended up unused here —
 * `listActiveUsersByRoleId()` already covers the ROLE-approver-type
 * candidate set; kept as a small, independently useful public-surface
 * addition rather than removed.
 *
 * Exports `ApprovalEngineService` prominently — it is this module's whole
 * reason to exist (docs/phase-3/01-system-architecture.md §5): every future
 * domain module composes `submit()` into its own transaction and checks
 * `getStatus()` before posting. The other application services are also
 * exported for admin-configuration UIs to call directly, but
 * `ApprovalEngineService` is the one every other module needs.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApprWorkflowDefEntity,
      ApprWorkflowVersionEntity,
      ApprLevelEntity,
      ApprRoutingRuleEntity,
      ApprInstanceEntity,
      ApprActionEntity,
      ApprDelegationEntity,
    ]),
    UsersModule,
  ],
  controllers: [
    WorkflowDefinitionsController,
    WorkflowVersionsController,
    DelegationsController,
    InstancesController,
  ],
  providers: [
    OutboxWriterService,
    ApprWorkflowDefRepository,
    ApprWorkflowVersionRepository,
    ApprLevelRepository,
    ApprRoutingRuleRepository,
    ApprInstanceRepository,
    ApprActionRepository,
    ApprDelegationRepository,
    WorkflowDefinitionsService,
    WorkflowVersionsService,
    LevelsService,
    RoutingRulesService,
    DelegationsService,
    ApprovalEngineService,
  ],
  exports: [
    WorkflowDefinitionsService,
    WorkflowVersionsService,
    LevelsService,
    RoutingRulesService,
    DelegationsService,
    ApprovalEngineService,
  ],
})
export class ApprovalsModule {}
