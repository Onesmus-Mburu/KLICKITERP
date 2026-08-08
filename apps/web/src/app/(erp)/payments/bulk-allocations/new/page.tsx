"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/patterns/data-table";
import { ApiError } from "@/lib/api-error";
import { formatMoney, sumMoneyStrings } from "@/lib/money";
import { downloadBulkAllocationTemplate, parseBulkAllocationFile, type RawBulkAllocationRow } from "@/features/payments/lib/bulk-allocation-xlsx";
import {
  getUnresolvedAdmissionNumbers,
  resolveBulkAllocationRows,
  type BulkAllocationPreviewRow,
  type BulkAllocationRowReason,
} from "@/features/payments/lib/bulk-allocation-resolve";
import { useCreateBulkAllocationBatch } from "@/features/payments/hooks/use-bulk-allocation";
import { BankAccountSelect } from "@/features/payments/components/bank-account-select";

type Step = "setup" | "preview" | "creating";

/**
 * Upload -> preview -> one-shot create (per the plan). Structural template
 * mirrors `BulkImportDialog`'s SHAPE (setup/preview/results steps) — but
 * this is a real page, not a dialog, uses genuinely new parsing/validation
 * logic (`admissionNo`+`amount` columns, not student demographics), and
 * calls `BulkAllocationController`'s real ONE-SHOT batch `POST` (not N
 * sequential calls the way Students' import has to work around having no
 * real batch endpoint).
 *
 * The preview step's real job, per the plan's explicit instruction: surface
 * unresolved admission numbers as a BATCH-WIDE BLOCKING issue before
 * allowing submit — `admission-number resolution happens synchronously for
 * the WHOLE batch at create time; any unresolved number rejects everything
 * up front` (`BulkAllocationService.createBatch()`), so submitting a batch
 * this preview already knows will fail server-side would just waste a round
 * trip and produce a worse error message than this screen's own per-row
 * table already shows.
 */
export default function NewBulkAllocationPage() {
  const t = useTranslations("payments.bulkAllocations.new");
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [step, setStep] = React.useState<Step>("setup");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [resolving, setResolving] = React.useState(false);
  const [rows, setRows] = React.useState<BulkAllocationPreviewRow[]>([]);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // Phase 6 Slice 7 — the batch's own real bank_account (a real FK,
  // migration 0220): every line is captured as a single BANK_TRANSFER split
  // against this ONE account, chosen once per batch, not per line. Fixes the
  // real Slice 6 bug where BulkAllocationService.matchAndPost() fabricated a
  // non-UUID placeholder string here instead of asking for a real account.
  const [bankAccountId, setBankAccountId] = React.useState("");

  const createMutation = useCreateBulkAllocationBatch();

  function reasonText(reason: BulkAllocationRowReason): string {
    return t(`reasons.${reason}`);
  }

  async function handleFileChosen(file: File) {
    setParseError(null);
    setResolving(true);
    try {
      const rawRows: RawBulkAllocationRow[] = await parseBulkAllocationFile(file);
      if (rawRows.length === 0) {
        setParseError(t("noRows"));
        setResolving(false);
        return;
      }
      const resolved = await resolveBulkAllocationRows(rawRows);
      setRows(resolved);
      setFileName(file.name);
      setStep("preview");
    } catch {
      setParseError(t("parseError"));
    } finally {
      setResolving(false);
    }
  }

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;
  const unresolvedAdmissionNos = getUnresolvedAdmissionNumbers(rows);
  const total = sumMoneyStrings(rows.filter((r) => r.valid).map((r) => r.normalizedAmount ?? "0"));

  async function handleSubmit() {
    setSubmitError(null);
    setStep("creating");
    try {
      const batch = await createMutation.mutateAsync({
        instrument: { fileName: fileName ?? "unknown", uploadedAt: new Date().toISOString(), sourceType: "xlsx" },
        lines: rows.filter((r) => r.valid).map((r) => ({ admissionNo: r.admissionNo, amount: r.normalizedAmount as string })),
        bankAccountId,
      });
      router.push(`/payments/bulk-allocations/${batch.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("genericError"));
      setStep("preview");
    }
  }

  const columns = React.useMemo<ColumnDef<BulkAllocationPreviewRow>[]>(
    () => [
      { accessorKey: "rowNumber", header: t("columnRow") },
      { accessorKey: "admissionNo", header: t("columnAdmissionNo") },
      { id: "amount", header: t("columnAmount"), cell: ({ row }) => row.original.normalizedAmount ?? row.original.raw.amount ?? "—" },
      { id: "student", header: t("columnStudent"), cell: ({ row }) => row.original.studentName ?? "—" },
      {
        id: "status",
        header: t("rowStatus"),
        cell: ({ row }) => (row.original.valid ? <Badge variant="soft-success">{t("rowValid")}</Badge> : <Badge variant="soft-destructive">{t("rowInvalid")}</Badge>),
      },
      {
        id: "reason",
        header: t("columnReason"),
        cell: ({ row }) =>
          row.original.valid ? null : (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
              {row.original.reasons.map((reason, i) => (
                <li key={i}>{reasonText(reason)}</li>
              ))}
            </ul>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` from next-intl is stable per-locale
    [t],
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payments">
          <ArrowLeft className="size-4" />
          {t("backToPayments")}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {step === "setup" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("step1Title")}</CardTitle>
            <CardDescription>{t("step1Description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t("bankAccountLabel")}</label>
              <BankAccountSelect value={bankAccountId} onChange={setBankAccountId} />
              <p className="text-xs text-muted-foreground">{t("bankAccountHint")}</p>
            </div>
            <div className="space-y-2">
              <Button type="button" variant="outline" onClick={downloadBulkAllocationTemplate}>
                <Download className="size-4" />
                {t("downloadTemplate")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("templateHint")}</p>
            </div>
            <div className="space-y-2">
              {parseError && (
                <Alert variant="destructive">
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileChosen(file);
                }}
                disabled={resolving}
              />
              {resolving && <p className="text-xs text-muted-foreground">{t("resolving")}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {(step === "preview" || step === "creating") && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-foreground">{t("previewTitle")}</CardTitle>
              <div className="flex gap-2 text-xs">
                <Badge variant="soft-success">{validCount}</Badge>
                <Badge variant="soft-destructive">{invalidCount}</Badge>
              </div>
            </div>
            <CardDescription>{t("previewSummary", { total: formatMoney(total), count: validCount })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            {unresolvedAdmissionNos.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("unresolvedBlockingNote", { count: unresolvedAdmissionNos.length })}
                  <ul className="mt-1 list-disc pl-4">
                    {unresolvedAdmissionNos.map((no) => (
                      <li key={no}>{no}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {!bankAccountId && (
              <Alert variant="destructive">
                <AlertDescription>{t("bankAccountMissingNote")}</AlertDescription>
              </Alert>
            )}

            <DataTable columns={columns} data={rows} />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("setup")} disabled={step === "creating"}>
                {t("backToUpload")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={validCount === 0 || unresolvedAdmissionNos.length > 0 || !bankAccountId || step === "creating"}
              >
                {step === "creating" ? t("creating") : t("createButton", { count: validCount })}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
