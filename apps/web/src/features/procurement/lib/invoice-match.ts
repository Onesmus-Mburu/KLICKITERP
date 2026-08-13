/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — `lib/` sibling of
 * `po-lines.ts`, mirroring Slice 17 Part 4's `features/accounting/lib/integrity-findings.ts`
 * pattern for a hand-defined response shape that has NO generated type at
 * all: `SupplierInvoiceResponseDto.matchVariance` is `Record<string, unknown>
 * | null` in both the raw openapi type and `@klickit/contracts`' own zod
 * mirror (`z.record(z.string(), z.unknown()).nullable()`) — a genuinely
 * opaque JSONB column, not a codegen gap on an otherwise-typed field.
 *
 * This shape is defined directly from reading `SupplierInvoicesService.matchAgainstPo()`
 * (`packages/server/src/domains/procurement/application/supplier-invoices.service.ts`)
 * verbatim, not guessed: it builds and persists exactly its own
 * `MatchVarianceResult` interface. Every amount here is a
 * `Money.toDecimalString()` decimal STRING (4dp), never a JS number, same
 * discipline `lib/money.ts` establishes everywhere else in this app.
 * `qtyWithinTolerance`/`priceWithinTolerance` are two INDEPENDENT dimensions
 * (both must pass for `withinTolerance`) — see `SupplierInvoicesService`'s own
 * doc comment for exactly how each is computed (qty: aggregate
 * ordered-vs-accepted; price: EITHER the percentage OR the flat KES
 * tolerance passing is enough).
 *
 * **`resolution` is optional and only appears after `resolveMatchException()`
 * has run at least once** — `SupplierInvoicesService.resolveMatchException()`
 * spreads the existing `matchVariance` and APPENDS a `resolution` key onto it
 * (never overwrites the original computed comparison), so a `MATCHED`
 * invoice that went through an `ACCEPT_VARIANCE` override still carries both
 * the original computed numbers AND the resolution audit trail —
 * `<InvoiceMatchPanel>` renders both when present.
 *
 * **Unlike `gl_integrity_run` (the table `integrity-findings.ts` guards
 * against), `proc_supplier_invoice.match_variance` is NOT a shared/multi-
 * producer column** — only `SupplierInvoicesService` ever writes it, so
 * there's no analogous "a different module's row landed in this list with an
 * incompatible shape" risk. `parseInvoiceMatchVariance()` still returns
 * `null` for a non-matching shape rather than asserting blindly, purely as
 * defense-in-depth against a future schema change to this same JSONB column,
 * matching this codebase's own established discipline of never trusting an
 * untyped JSONB blob structurally without checking first. A brand-new
 * invoice's `matchVariance` starts genuinely `null` (before `match()` has
 * ever run) — callers check that case separately, `parseInvoiceMatchVariance()`
 * itself takes a non-null `object` (a real, already-present blob) and only
 * decides whether ITS shape looks right.
 */
export interface InvoiceMatchVarianceLine {
  poLineId: string;
  poQty: string;
  grnAcceptedQty: string;
  grnValue: string;
}

export interface InvoiceMatchVarianceTolerances {
  qtyPercent: number;
  pricePercent: number;
  absoluteKes: number;
}

export interface InvoiceMatchVarianceResolution {
  action: "ACCEPT_VARIANCE" | "REJECT";
  note: string;
  resolvedAt: string;
  resolvedBy: string | null;
}

export interface InvoiceMatchVariance {
  matchedAt: string;
  poId: string;
  invoiceTotal: string;
  poOrderedQty: string;
  grnAcceptedQty: string;
  grnAcceptedValue: string;
  priceVarianceAmount: string;
  qtyWithinTolerance: boolean;
  priceWithinTolerance: boolean;
  withinTolerance: boolean;
  tolerances: InvoiceMatchVarianceTolerances;
  lines: InvoiceMatchVarianceLine[];
  resolution?: InvoiceMatchVarianceResolution;
}

/**
 * `matchVariance` arrives typed as a bare `object`/`Record<string, unknown>`
 * (no generated shape exists to check against). Returns `null` when the
 * value doesn't structurally match this module's own shape (see this file's
 * own doc comment above) — every other field is trusted as-is once the
 * required scalars/`lines` array/`tolerances` object are confirmed real,
 * matching `parseIntegrityFindings()`'s (Slice 17 Part 4) own established
 * discipline of trusting the server's own response shape rather than
 * re-parsing every field with zod client-side.
 */
export function parseInvoiceMatchVariance(matchVariance: object): InvoiceMatchVariance | null {
  const candidate = matchVariance as Partial<InvoiceMatchVariance>;
  if (
    typeof candidate.withinTolerance !== "boolean" ||
    typeof candidate.qtyWithinTolerance !== "boolean" ||
    typeof candidate.priceWithinTolerance !== "boolean" ||
    !Array.isArray(candidate.lines) ||
    typeof candidate.tolerances !== "object" ||
    candidate.tolerances === null
  ) {
    return null;
  }
  return candidate as InvoiceMatchVariance;
}
