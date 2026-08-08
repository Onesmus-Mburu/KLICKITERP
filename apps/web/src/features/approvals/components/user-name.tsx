"use client";

import { useUser } from "../hooks/use-user";

/**
 * Initiator/supervisor/actor name resolution — the same
 * conditional-degrade-to-raw-id template `GlAccountSelect`
 * (`features/billing/components/gl-account-select.tsx`)/`BankAccountSelect`
 * (`features/payments/components/bank-account-select.tsx`) already
 * established, per the plan's own explicit instruction to reuse it rather
 * than invent a new pattern: the primary path is a real name (`GET
 * /users/{id}`), degrading to a truncated, `title`-attributed raw id on
 * `isLoading`/`isError` (a `users:user:view`-missing role is the EXPECTED
 * common case for a plain approver, not a rare edge case — same framing as
 * `BankAccountSelect`'s own doc comment for `banking:account:manage`).
 */
export function UserName({ id }: { id: string }) {
  const query = useUser(id);

  if (query.isLoading) {
    return <span className="text-muted-foreground">…</span>;
  }

  if (query.isError || !query.data) {
    return (
      <span className="text-muted-foreground" title={id}>
        {id.slice(0, 8)}…
      </span>
    );
  }

  return <span>{query.data.fullName}</span>;
}
