/**
 * Ports & adapters boundary (docs/phase-3/02-communication-authentication.md
 * §1.5: `sync: AccountingSyncPort ─ QuickBooksAdapter | XeroAdapter |
 * SageAdapter`). One port, one method per direction this pass implements:
 * `pushEntity()` (outbound, PUSH-only — `direction` is currently always
 * `'PUSH'`, kept as an explicit parameter rather than hardcoded so a future
 * `'PULL'` inbound-sync direction can reuse this same signature without a
 * breaking change) and `testConnection()`, mirroring FR-SET-003.1's Test
 * Connection pattern exactly (QuickBooks example given there: "company
 * info" call — see `QuickBooksAdapter.testConnection()`).
 */
export type AccountingSyncEntityKind = "INVOICE" | "PAYMENT" | "EXPENSE" | "CUSTOMER";

export interface AccountingSyncPushResult {
  providerRef: string;
}

export interface AccountingSyncTestResult {
  ok: boolean;
  message: string;
}

export interface AccountingSyncPort {
  pushEntity(
    kind: AccountingSyncEntityKind,
    direction: "PUSH",
    payload: Record<string, unknown>,
  ): Promise<AccountingSyncPushResult>;

  testConnection(): Promise<AccountingSyncTestResult>;
}
