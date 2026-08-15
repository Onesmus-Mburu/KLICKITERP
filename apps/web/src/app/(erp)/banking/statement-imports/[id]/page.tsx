"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAccount as useBankAccount } from "@/features/banking/hooks/use-accounts";
import { useStatementImport, type BankStatementImport } from "@/features/banking/hooks/use-statement-import";

/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — a statement
 * import's detail page: import-level summary (`importedAt`/account/
 * `lineCount`/`duplicateCount`, the honest `dedupeSummary` phrasing also used
 * by `import-result-summary.tsx`) + the mapping template that produced it,
 * shown READ-ONLY "for reference" (per the task brief's own explicit
 * instruction), never as an editable/reusable "template" — there's nowhere
 * to save an edit back to (no update route exists on
 * `StatementImportController`).
 *
 * **No line-browsing section** — deliberately absent. There is no
 * `GET .../statement-imports/{id}/lines` (or any other) endpoint anywhere on
 * `StatementImportController` to list the real `bank_statement_line` rows
 * this import created (confirmed by reading the controller directly, 71
 * lines — `create`/`list`/`findOne` on the IMPORT itself only), so this page
 * cannot show "which lines were inserted" — only the import-level counts the
 * real API actually returns.
 */
export default function StatementImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("banking.statementImports.detail");
  const importQuery = useStatementImport(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/banking/statement-imports">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={importQuery}>{(statementImport) => <StatementImportDetailCard statementImport={statementImport} />}</QueryBoundary>
    </div>
  );
}

/** A separate, top-level component — its own `useBankAccount()` hook call needs a stable component identity across renders, the same "resolve a foreign id, don't nest the component" discipline `accounts/[id]/page.tsx`'s own `AccountDetailCard` (Part 1) already establishes. */
function StatementImportDetailCard({ statementImport }: { statementImport: BankStatementImport }) {
  const t = useTranslations("banking.statementImports.detail");
  const tCommon = useTranslations("banking.statementImports");
  const router = useRouter();
  const accountQuery = useBankAccount(statementImport.accountId);
  const accountLabel = accountQuery.data ? accountQuery.data.name : statementImport.accountId;
  const { columnMap, dateFormat, debitCreditConvention } = statementImport.mappingTemplate;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{new Date(statementImport.importedAt).toLocaleString()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("accountLabel")}</p>
              <button type="button" className="text-sm text-primary hover:underline" onClick={() => router.push(`/banking/accounts/${statementImport.accountId}`)}>
                {accountLabel}
              </button>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("fileIdLabel")}</p>
              <p className="font-mono text-xs text-foreground">{statementImport.fileId}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("duplicateCountLabel")}</p>
              {statementImport.duplicateCount > 0 ? <Badge variant="soft-secondary">{statementImport.duplicateCount}</Badge> : <p className="text-sm text-foreground">0</p>}
            </div>
          </div>

          <Alert variant="success">
            <AlertDescription>
              {tCommon("dedupeSummary", { inserted: statementImport.lineCount, duplicates: statementImport.duplicateCount })}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("mappingTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{t("mappingDate", { column: columnMap.date, format: dateFormat })}</p>
          <p>{t("mappingDescription", { column: columnMap.description })}</p>
          <p>
            {debitCreditConvention === "SEPARATE_COLUMNS"
              ? t("mappingSeparate", { debit: columnMap.debit ?? "", credit: columnMap.credit ?? "" })
              : t("mappingSigned", { column: columnMap.amount ?? "" })}
          </p>
          {columnMap.ref && <p>{t("mappingRef", { column: columnMap.ref })}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
