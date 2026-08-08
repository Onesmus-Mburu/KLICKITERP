import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { SettingsService } from "../../../platform/settings";
// Barrel import of an application-layer repository (not an entity-decorator
// target) — safe, same precedent `InvoicingService`/`ConcessionsService` use
// importing `domains/students`' barrel. `BillInvoiceRepository` is already
// exported from `domains/billing`'s public barrel for exactly this kind of
// cross-domain read.
import { BillInvoiceRepository } from "../../billing";

/** `set_setting.key` this service reads for BR-PAY-02's default allocation rule. */
export const ALLOCATION_DEFAULT_RULE_SETTING_KEY = "billing.allocation_default_rule";

export type AllocationRule = "OLDEST_FIRST" | "CATEGORY_PRIORITY";

export interface ResolveAllocationsInput {
  studentId: string;
  amount: Money;
  /**
   * Phase 6 Slice 8 (Part 3) — "Collect Fees" directed multi-invoice
   * collection. When present and non-empty, `findOpenForStudent()`'s result
   * is filtered down to ONLY these invoice ids (in-memory `.filter()` — a
   * student's open-invoice count is always small, no new repository method
   * needed) BEFORE the existing FIFO-by-due-date-oldest-first loop below —
   * the loop itself, the `toPrepayment` remainder handling (BR-PAY-03), and
   * every downstream write path (`ReceiptsService.captureReceipt()`'s
   * `pay_receipt_allocation` rows, `applyInvoiceAllocation()`) are completely
   * untouched, they just run against a possibly-narrower invoice set. When
   * absent or empty, behavior is BYTE-FOR-BYTE UNCHANGED from before this
   * field existed — every existing caller (cheques, suspense, M-Pesa,
   * bulk-allocation, the plain cashier capture form) omits it and is
   * unaffected.
   */
  invoiceIds?: string[];
}

export interface ResolvedAllocation {
  /** Set when this slice of the receipt applies to a specific open invoice; absent for the `toPrepayment` remainder. */
  invoiceId?: string;
  /**
   * Reserved for a future category-priority/installment-aware allocator —
   * this pass's `OLDEST_FIRST` implementation always allocates at the
   * whole-invoice level and leaves this unset. `ReceiptsService` performs
   * its own best-effort `bill_installment.settled_amount` bookkeeping
   * (oldest-seq-first within the invoice) as a side effect of applying each
   * invoice-level allocation — see that service's doc comment — rather than
   * this service resolving individual installment targets itself.
   */
  installmentId?: string;
  amount: Money;
  toPrepayment: boolean;
}

/**
 * BR-PAY-02/BR-PAY-03 — resolves how a captured receipt's total should be
 * applied against a student's open invoices, with any remainder always
 * landing in prepayment (never left unaccounted for).
 *
 * **`OLDEST_FIRST`** (the only rule fully implemented this pass, per the
 * task brief): reads `billing.allocation_default_rule` from Settings
 * (default `OLDEST_FIRST` when unset), fetches the student's open invoices
 * via `BillInvoiceRepository.findOpenForStudent()` (already sorted
 * `due_date ASC` — oldest-due-first), and greedily consumes each invoice's
 * `balance` in that order until the amount is exhausted. Any amount left
 * after every open invoice is satisfied becomes one final
 * `{ toPrepayment: true }` entry (BR-PAY-03 — "a receipt can never leave
 * unallocated floating money").
 *
 * **Directed scoping** (Phase 6 Slice 8 Part 3, "Collect Fees"): callers may
 * pass `invoiceIds` on `ResolveAllocationsInput` to restrict the FIFO loop to
 * a caller-picked subset of the student's open invoices (e.g. a cashier
 * checking exactly 2 of a student's 5 open invoices before capturing a
 * receipt) — see `ResolveAllocationsInput.invoiceIds`'s own doc comment for
 * the exact mechanics. This is a pure narrowing of the candidate set; the
 * FIFO ordering, the `toPrepayment` remainder rule, and every downstream
 * write path are unaffected.
 *
 * **`CATEGORY_PRIORITY`** is a documented future enhancement, not
 * implemented in this pass — `resolveAllocations()` throws a clear
 * `ValidationException` if the setting is configured to anything other than
 * `OLDEST_FIRST`, rather than silently mis-allocating (BR-PAY-02's
 * audit-trail intent would be violated by a rule the caller believes is
 * active but isn't really honored).
 */
@Injectable()
export class AllocationService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly invoiceRepository: BillInvoiceRepository,
  ) {}

  async resolveAllocations(em: EntityManager, input: ResolveAllocationsInput): Promise<ResolvedAllocation[]> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("AllocationService.resolveAllocations: amount must be positive");
    }

    const rule = await this.settingsService.getTyped<AllocationRule>(ALLOCATION_DEFAULT_RULE_SETTING_KEY, "OLDEST_FIRST");
    if (rule !== "OLDEST_FIRST") {
      throw new ValidationException(
        `AllocationService.resolveAllocations: allocation rule '${rule}' is not yet implemented in this pass — ` +
          `only OLDEST_FIRST is fully realized (CATEGORY_PRIORITY is a documented future enhancement). ` +
          `Reconfigure Settings key '${ALLOCATION_DEFAULT_RULE_SETTING_KEY}' to 'OLDEST_FIRST'.`,
      );
    }

    const allOpenInvoices = await this.invoiceRepository.findOpenForStudent(input.studentId, em);
    // Phase 6 Slice 8 (Part 3): narrow to a caller-directed subset when given
    // — order is preserved from `findOpenForStudent()`'s own oldest-due-date-
    // first sort, so the FIFO loop below still consumes the CHECKED set
    // oldest-first, exactly mirroring the unscoped rule's own ordering.
    const openInvoices =
      input.invoiceIds && input.invoiceIds.length > 0
        ? allOpenInvoices.filter((invoice) => input.invoiceIds!.includes(invoice.id))
        : allOpenInvoices;
    const allocations: ResolvedAllocation[] = [];
    let remaining = input.amount;

    for (const invoice of openInvoices) {
      if (remaining.isZero()) break;
      const take = minMoney(invoice.balance, remaining);
      if (!take.isPositive()) continue;
      allocations.push({ invoiceId: invoice.id, amount: take, toPrepayment: false });
      remaining = remaining.subtract(take);
    }

    // BR-PAY-03: never leave a remainder unaccounted for — surplus becomes
    // the student's prepayment (credit) balance, realized via P-09 at
    // posting time.
    if (remaining.isPositive()) {
      allocations.push({ amount: remaining, toPrepayment: true });
    }

    return allocations;
  }
}

function minMoney(a: Money, b: Money): Money {
  return a.compare(b) <= 0 ? a : b;
}
