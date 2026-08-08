import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ExpCategoryEntity } from "./domain/exp-category.entity";
import { ExpVoucherEntity } from "./domain/exp-voucher.entity";
import { ExpPettyCashFloatEntity } from "./domain/exp-petty-cash-float.entity";
import { ExpPettyCashVoucherEntity } from "./domain/exp-petty-cash-voucher.entity";
import { ExpReplenishmentEntity } from "./domain/exp-replenishment.entity";
import { ExpClaimEntity } from "./domain/exp-claim.entity";
import { ExpClaimLineEntity } from "./domain/exp-claim-line.entity";
import { ExpRecurringEntity } from "./domain/exp-recurring.entity";
import { AccountingModule } from "../../accounting";
import { SettingsModule } from "../../platform/settings";
import { ApprovalsModule } from "../../platform/approvals";
import { FilesModule } from "../../platform/files";
import { ExpCategoryRepository } from "./infrastructure/exp-category.repository";
import { ExpVoucherRepository } from "./infrastructure/exp-voucher.repository";
import { ExpPettyCashFloatRepository } from "./infrastructure/exp-petty-cash-float.repository";
import { ExpPettyCashVoucherRepository } from "./infrastructure/exp-petty-cash-voucher.repository";
import { ExpReplenishmentRepository } from "./infrastructure/exp-replenishment.repository";
import { ExpClaimRepository } from "./infrastructure/exp-claim.repository";
import { ExpClaimLineRepository } from "./infrastructure/exp-claim-line.repository";
import { ExpRecurringRepository } from "./infrastructure/exp-recurring.repository";
import { CategoriesService } from "./application/categories.service";
import { VouchersService } from "./application/vouchers.service";
import { PettyCashService } from "./application/petty-cash.service";
import { ClaimsService } from "./application/claims.service";
import { RecurringService } from "./application/recurring.service";
import { CategoriesController } from "./api/categories.controller";
import { VouchersController } from "./api/vouchers.controller";
import { PettyCashController } from "./api/petty-cash.controller";
import { ClaimsController } from "./api/claims.controller";
import { RecurringController } from "./api/recurring.controller";

/**
 * Module 14 (Expenses) — full module anatomy on top of `accounting`,
 * `platform/settings`, `platform/approvals`, `platform/files` (BR-EXP-03's
 * attachment-count check via `FilesService.listByEntity()`) —
 * `platform/users` is in this module's `mayImport` list too but no service
 * here calls into it directly (every FK to `usr_user` is entity-only, per
 * the foundation pass's own note).
 *
 * **Controllers array verified explicitly** — per this task's own warning
 * about a real prior near-miss in this codebase (a `controllers` array once
 * forgotten despite `tsc` passing clean, shipping unreachable routes): all
 * 5 controllers below (`CategoriesController`, `VouchersController`,
 * `PettyCashController`, `ClaimsController`, `RecurringController`) ARE
 * present.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpCategoryEntity,
      ExpVoucherEntity,
      ExpPettyCashFloatEntity,
      ExpPettyCashVoucherEntity,
      ExpReplenishmentEntity,
      ExpClaimEntity,
      ExpClaimLineEntity,
      ExpRecurringEntity,
    ]),
    AccountingModule,
    SettingsModule,
    ApprovalsModule,
    FilesModule,
  ],
  controllers: [CategoriesController, VouchersController, PettyCashController, ClaimsController, RecurringController],
  providers: [
    ExpCategoryRepository,
    ExpVoucherRepository,
    ExpPettyCashFloatRepository,
    ExpPettyCashVoucherRepository,
    ExpReplenishmentRepository,
    ExpClaimRepository,
    ExpClaimLineRepository,
    ExpRecurringRepository,
    CategoriesService,
    VouchersService,
    PettyCashService,
    ClaimsService,
    RecurringService,
  ],
  exports: [
    ExpCategoryRepository,
    ExpVoucherRepository,
    ExpPettyCashFloatRepository,
    ExpPettyCashVoucherRepository,
    ExpReplenishmentRepository,
    ExpClaimRepository,
    ExpClaimLineRepository,
    ExpRecurringRepository,
    CategoriesService,
    VouchersService,
    PettyCashService,
    ClaimsService,
    RecurringService,
  ],
})
export class ExpensesModule {}
