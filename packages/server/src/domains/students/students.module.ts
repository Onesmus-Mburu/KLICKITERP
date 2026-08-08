import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { SettingsModule } from "../../platform/settings";
import { ClassesController } from "./api/classes.controller";
import { FeeGroupsController } from "./api/fee-groups.controller";
import { GuardiansController } from "./api/guardians.controller";
import { PromotionController } from "./api/promotion.controller";
import { StreamsController } from "./api/streams.controller";
import { StudentLedgerController } from "./api/student-ledger.controller";
import { StudentsController } from "./api/students.controller";
import { ClassesService } from "./application/classes.service";
import { FeeGroupsService } from "./application/fee-groups.service";
import { GuardiansService } from "./application/guardians.service";
import { PromotionService } from "./application/promotion.service";
import { StreamsService } from "./application/streams.service";
import { StudentLedgerService } from "./application/student-ledger.service";
import { StudentsService } from "./application/students.service";
import { StdClassEntity } from "./domain/std-class.entity";
import { StdFeeGroupEntity } from "./domain/std-fee-group.entity";
import { StdGuardianEntity } from "./domain/std-guardian.entity";
import { StdLedgerEntryEntity } from "./domain/std-ledger-entry.entity";
import { StdPromotionBatchEntity } from "./domain/std-promotion-batch.entity";
import { StdStreamEntity } from "./domain/std-stream.entity";
import { StdStudentGuardianEntity } from "./domain/std-student-guardian.entity";
import { StdStudentEntity } from "./domain/std-student.entity";
import { StdClassRepository } from "./infrastructure/std-class.repository";
import { StdFeeGroupRepository } from "./infrastructure/std-fee-group.repository";
import { StdGuardianRepository } from "./infrastructure/std-guardian.repository";
import { StdLedgerEntryRepository } from "./infrastructure/std-ledger-entry.repository";
import { StdPromotionBatchRepository } from "./infrastructure/std-promotion-batch.repository";
import { StdStreamRepository } from "./infrastructure/std-stream.repository";
import { StdStudentGuardianRepository } from "./infrastructure/std-student-guardian.repository";
import { StdStudentRepository } from "./infrastructure/std-student.repository";

/**
 * Module 8 (Students) — the first DOMAIN module (Modules 1-7 were all
 * "platform"/"accounting-core"). `FilesModule`/`UsersModule` are still NOT
 * imported as Nest modules here — this module only needs those two
 * siblings' *entity classes* (for FK `@ManyToOne` targets: `FileObjectEntity`,
 * `UsrUserEntity`) and *nothing at runtime* from their services.
 * `module-deps.json`'s `domains/students` entry (`mayImport: ["shared",
 * "accounting", "platform/settings", "platform/files", "platform/users",
 * "domains/billing"]`) documents the entity-only nature of those two
 * platform imports.
 *
 * **`SettingsModule` IS a real runtime import (Phase 6 Slice 2b item 8)** —
 * `StudentsService` injects `SettingsService`/`NumberingService` for the
 * admission-number autogen feature (`GET/PUT /students/settings/admission-no-autogen`,
 * `NumberingService.allocate(manager, "STD_ADMISSION")` inside `create()`'s
 * transaction), the same "import the whole sibling module because a service
 * actually calls into it" pattern `accounting.module.ts`/`billing.module.ts`
 * already established, imported via `platform/settings`'s public barrel
 * only, per `crossSiblingImportPolicy`.
 *
 * Controller registration order matters: `GuardiansController` and
 * `StudentLedgerController` share the `students` path prefix with
 * `StudentsController` — `GuardiansController`'s static `students/guardians`
 * route must be registered before `StudentsController`'s dynamic
 * `students/:id` route so it wins the same-segment-count match (see
 * `GuardiansController`'s doc comment).
 *
 * Exports `StudentLedgerService`/`StudentsService` prominently — Billing
 * (Module 9), Payments (Module 10), and Wallet (Module 11) are all expected
 * to inject them directly (`StudentLedgerService.appendEntry()` inside their
 * own posting transactions; `StudentsService` for status/lookup).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StdClassEntity,
      StdStreamEntity,
      StdFeeGroupEntity,
      StdStudentEntity,
      StdGuardianEntity,
      StdStudentGuardianEntity,
      StdLedgerEntryEntity,
      StdPromotionBatchEntity,
    ]),
    SettingsModule,
  ],
  controllers: [
    ClassesController,
    StreamsController,
    FeeGroupsController,
    GuardiansController,
    StudentLedgerController,
    PromotionController,
    StudentsController,
  ],
  providers: [
    StdClassRepository,
    StdStreamRepository,
    StdFeeGroupRepository,
    StdStudentRepository,
    StdGuardianRepository,
    StdStudentGuardianRepository,
    StdLedgerEntryRepository,
    StdPromotionBatchRepository,
    OutboxWriterService,
    ClassesService,
    StreamsService,
    FeeGroupsService,
    StudentsService,
    GuardiansService,
    StudentLedgerService,
    PromotionService,
  ],
  exports: [
    StdClassRepository,
    StdStreamRepository,
    StdFeeGroupRepository,
    StdStudentRepository,
    StdGuardianRepository,
    StdStudentGuardianRepository,
    StdLedgerEntryRepository,
    StdPromotionBatchRepository,
    ClassesService,
    StreamsService,
    FeeGroupsService,
    StudentsService,
    GuardiansService,
    StudentLedgerService,
    PromotionService,
  ],
})
export class StudentsModule {}
