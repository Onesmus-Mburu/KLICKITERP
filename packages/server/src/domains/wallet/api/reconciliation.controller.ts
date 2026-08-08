import { Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { WalletTransactionsService } from "../application/wallet-transactions.service";
import { GlIntegrityRunEntity } from "../../../accounting";

function toView(run: GlIntegrityRunEntity | null) {
  if (!run) return null;
  return { id: run.id, ranAt: run.ranAt, kind: run.kind, ok: run.ok, findings: run.findings };
}

/**
 * BR-WALL-08/FR-WALL-012.1 — on-demand wallet-vs-GL reconciliation.
 * Automatic hourly triggering is deliberately NOT wired (no scheduler/worker
 * exists anywhere in this codebase — see `WalletTransactionsService
 * .reconcile()`'s doc comment for the full honest scope note).
 */
@ApiTags("wallet-reconciliation")
@Controller("wallet-reconciliation")
export class ReconciliationController {
  constructor(private readonly walletTransactionsService: WalletTransactionsService) {}

  @Post("run")
  @RequirePermission("wallet:reconciliation:run")
  @ApiOperation({ summary: "Run an on-demand wallet-vs-GL-control-account reconciliation sweep and record the result" })
  @ApiResponse({ status: 201 })
  async run() {
    return toView(await this.walletTransactionsService.reconcile());
  }

  @Get("status")
  @RequirePermission("wallet:reconciliation:run")
  @ApiOperation({ summary: "Get the most recent reconciliation sweep result" })
  @ApiResponse({ status: 200 })
  async status() {
    return toView(await this.walletTransactionsService.lastReconciliation());
  }
}
