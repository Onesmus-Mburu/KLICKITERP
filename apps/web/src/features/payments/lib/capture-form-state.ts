import type { StudentResponseDto } from "@klickit/contracts";
import type { ReceiptSplitMethod } from "../constants";

/**
 * Phase 6 Slice 4 — the capture screen is a dynamic array of split rows with
 * per-row conditional fields and a live cross-field sum check reacting on
 * every keystroke, structurally different from the Students/Billing flat
 * forms. Follows Billing's own precedent for this shape
 * (`features/billing/components/fee-structure-line-form.tsx`) — plain local
 * state/`useReducer`, not `react-hook-form` — kept in its own file (not
 * inlined in the component) since the state/action shape is non-trivial
 * enough to want its own tests-if-ever-added and a focused read, separate
 * from the render/hotkey-wiring concerns in `receipt-capture-form.tsx`.
 */
export interface SplitRowState {
  id: string;
  method: ReceiptSplitMethod | "";
  amount: string;
  bankAccountId: string;
  externalRef: string;
  chequeBankName: string;
  chequeNo: string;
  chequeDate: string;
  chequeDrawer: string;
}

export function emptySplitRow(id: string): SplitRowState {
  return {
    id,
    method: "",
    amount: "",
    bankAccountId: "",
    externalRef: "",
    chequeBankName: "",
    chequeNo: "",
    chequeDate: "",
    chequeDrawer: "",
  };
}

export interface CaptureFormState {
  student: StudentResponseDto | null;
  payerName: string;
  payerPhone: string;
  receiptDate: string;
  total: string;
  splits: SplitRowState[];
  /** Generated once via `crypto.randomUUID()` when the form mounts/resets (`initialCaptureFormState()`); stays stable across retries of THIS capture attempt, fresh only on the next `RESET`. */
  idempotencyKey: string;
  /**
   * Phase 6 Slice 8 (Part 3) — "Collect Fees" directed multi-invoice
   * collection. NEW, OPTIONAL-IN-EFFECT field: the checked invoice ids from
   * `CollectFeesFlow`'s `InvoiceSelectionPanel`. Defaults to an empty `Set`
   * and is only ever mutated via `TOGGLE_INVOICE`/`SET_SELECTED_INVOICES`
   * below — `receipt-capture-form.tsx` (the shipped cashier screen) never
   * dispatches either action, so this field simply sits at its empty default
   * for that screen, unread and inert; it does not change that screen's
   * render output or behavior in any way.
   */
  selectedInvoiceIds: Set<string>;
}

export type CaptureFormAction =
  | { type: "SET_STUDENT"; student: StudentResponseDto | null }
  | { type: "SET_FIELD"; field: "payerName" | "payerPhone" | "receiptDate" | "total"; value: string }
  | { type: "ADD_SPLIT"; id: string }
  | { type: "REMOVE_SPLIT"; id: string }
  | { type: "UPDATE_SPLIT"; id: string; patch: Partial<SplitRowState> }
  | { type: "RESET"; idempotencyKey: string }
  /**
   * Phase 6 Slice 8 (Part 3) — flips one invoice id's membership in
   * `selectedInvoiceIds`. `receipt-capture-form.tsx` never dispatches this.
   */
  | { type: "TOGGLE_INVOICE"; invoiceId: string }
  /**
   * Phase 6 Slice 8 (Part 3) — replaces the whole `selectedInvoiceIds` set
   * (used by `/billing/collect`'s `?invoiceId=` pre-check on initial load).
   * `receipt-capture-form.tsx` never dispatches this.
   */
  | { type: "SET_SELECTED_INVOICES"; invoiceIds: string[] };

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function initialCaptureFormState(idempotencyKey: string): CaptureFormState {
  return {
    student: null,
    payerName: "",
    payerPhone: "",
    receiptDate: todayIso(),
    total: "",
    splits: [emptySplitRow(crypto.randomUUID())],
    idempotencyKey,
    selectedInvoiceIds: new Set<string>(),
  };
}

export function captureFormReducer(state: CaptureFormState, action: CaptureFormAction): CaptureFormState {
  switch (action.type) {
    case "SET_STUDENT":
      return {
        ...state,
        student: action.student,
        // A non-destructive default: prefills the payer name from the
        // selected student's own name ONLY while the cashier hasn't typed
        // anything there yet — a real payer (e.g. a guardian) can still
        // differ and overwrite it freely; this never clobbers an
        // already-typed value.
        payerName: !state.payerName.trim() && action.student ? `${action.student.firstName} ${action.student.lastName}` : state.payerName,
      };
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "ADD_SPLIT":
      return { ...state, splits: [...state.splits, emptySplitRow(action.id)] };
    case "REMOVE_SPLIT":
      // Never drop the last row — the capture form always needs at least
      // one split row present to be a coherent form.
      return { ...state, splits: state.splits.length > 1 ? state.splits.filter((s) => s.id !== action.id) : state.splits };
    case "UPDATE_SPLIT":
      return { ...state, splits: state.splits.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };
    case "RESET":
      return initialCaptureFormState(action.idempotencyKey);
    case "TOGGLE_INVOICE": {
      const next = new Set(state.selectedInvoiceIds);
      if (next.has(action.invoiceId)) next.delete(action.invoiceId);
      else next.add(action.invoiceId);
      return { ...state, selectedInvoiceIds: next };
    }
    case "SET_SELECTED_INVOICES":
      return { ...state, selectedInvoiceIds: new Set(action.invoiceIds) };
    default:
      return state;
  }
}
