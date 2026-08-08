"use client";

import { useQuery } from "@tanstack/react-query";
import { getStudentLedgerStatement } from "../api/ledger.api";

/** READ-only — `students:ledger:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this feature. */
export function useStudentLedger(studentId: string | undefined) {
  return useQuery({
    queryKey: ["students", "ledger", studentId],
    queryFn: () => getStudentLedgerStatement(studentId as string),
    enabled: !!studentId,
  });
}
