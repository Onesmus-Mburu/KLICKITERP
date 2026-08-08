"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Pencil } from "lucide-react";
import type { StudentResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { STATUS_BADGE_VARIANT } from "@/features/students/components/student-columns";
import { StatusChangeDialog } from "@/features/students/components/status-change-dialog";
import { DeleteStudentButton } from "@/features/students/components/delete-student-button";
import { ExitClearAction } from "@/features/students/components/exit-clear-action";
import { GuardianSection } from "@/features/students/components/guardian-section";
import { LedgerTable } from "@/features/students/components/ledger-table";
import { useClasses } from "@/features/students/hooks/use-classes";
import { useStreamsForClass } from "@/features/students/hooks/use-streams";
import { useStudentLedger } from "@/features/students/hooks/use-ledger";
import { useStudent } from "@/features/students/hooks/use-students";
import { GenerateInvoiceDialog } from "@/features/billing/components/generate-invoice-dialog";
import { StudentInvoicesTable } from "@/features/billing/components/student-invoices-table";
import { CreditBalanceCard } from "@/features/billing/components/credit-balance-card";
import { useStudentInvoices } from "@/features/billing/hooks/use-invoices";
import { ReceiptsTable } from "@/features/payments/components/receipts-table";
import { useStudentReceipts } from "@/features/payments/hooks/use-receipts";
import { WalletCard } from "@/features/wallet/components/wallet-card";

/**
 * Phase 6 Slice 2c — `student-form.tsx`'s inline guardian section navigates
 * here immediately on a successful create-and-link (unlike its own
 * stay-put-on-failure path), so there's no persistent surface THERE to show
 * a "New guardian created" vs. "Linked to existing guardian {fullName} —
 * looks like a sibling!" note on. Handed off via `guardianStatus`/
 * `guardianName` query params instead, read once on mount here, then
 * stripped from the URL (`router.replace`) so a refresh doesn't repeat the
 * banner. Same wasExisting-aware copy `guardian-link-dialog.tsx`'s "new
 * guardian" tab shows inline.
 */
function GuardianStatusBanner() {
  const t = useTranslations("students.detail");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [note, setNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    const status = searchParams.get("guardianStatus");
    const name = searchParams.get("guardianName");
    if (status === "new") {
      setNote(t("guardianNewCreated"));
      router.replace(pathname);
    } else if (status === "existing") {
      setNote(t("guardianLinkedExisting", { fullName: name ?? "" }));
      router.replace(pathname);
    }
    // Intentionally run once on mount only — `searchParams` is read here
    // purely to seed local state before being stripped from the URL below;
    // re-running on every searchParams identity change would re-trigger
    // right after the replace() above clears them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!note) return null;
  return (
    <Alert variant="success">
      <AlertDescription>{note}</AlertDescription>
    </Alert>
  );
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function ClassName({ classId }: { classId: string }) {
  const classesQuery = useClasses();
  return <>{classesQuery.data?.find((k) => k.id === classId)?.name ?? "—"}</>;
}

function StreamName({ classId, streamId }: { classId: string; streamId: string | null }) {
  const streamsQuery = useStreamsForClass(streamId ? classId : undefined);
  if (!streamId) return <>—</>;
  return <>{streamsQuery.data?.find((s) => s.id === streamId)?.name ?? "—"}</>;
}

function StudentDetail({ student }: { student: StudentResponseDto }) {
  const t = useTranslations("students.detail");
  const tStatus = useTranslations("students.status");
  const tBoarding = useTranslations("students.boarding");
  const ledgerQuery = useStudentLedger(student.id);
  const invoicesQuery = useStudentInvoices(student.id);
  const receiptsQuery = useStudentReceipts(student.id);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {student.firstName} {student.middleName ? `${student.middleName} ` : ""}
            {student.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">{student.admissionNo}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChangeDialog student={student} />
          <Button asChild variant="outline">
            <Link href={`/students/${student.id}/edit`}>
              <Pencil className="size-4" />
              {t("editButton")}
            </Link>
          </Button>
          <DeleteStudentButton student={student} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("profile")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileRow label={t("statusLabel")} value={<Badge variant={STATUS_BADGE_VARIANT[student.status] ?? "outline"}>{tStatus(student.status)}</Badge>} />
            <ProfileRow label={t("boardingLabel")} value={tBoarding(student.boarding)} />
            <ProfileRow label={t("classLabel")} value={<ClassName classId={student.classId} />} />
            <ProfileRow label={t("streamLabel")} value={<StreamName classId={student.classId} streamId={student.streamId} />} />
            <ProfileRow label={t("enrolledOnLabel")} value={student.enrolledOn} />
            {student.exitedOn && <ProfileRow label={t("exitedOnLabel")} value={student.exitedOn} />}
            <ProfileRow label={t("exitClearedLabel")} value={<ExitClearAction student={student} />} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("guardians")}</CardTitle>
          </CardHeader>
          <CardContent>
            <GuardianSection studentId={student.id} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("ledger")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={ledgerQuery} isEmpty={(d) => d.length === 0}>
            {(rows) => <LedgerTable rows={rows} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      {/* Phase 6 Slice 3 (Billing core loop) — a new stacked full-width
          Card, same CardHeader/CardTitle/CardContent pattern as the
          Profile/Guardians/Ledger cards above, per the plan's own explicit
          instruction (no tab/accordion primitive exists anywhere in
          `components/ui/`, and this pass doesn't invent one). */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base text-foreground">{t("billingTitle")}</CardTitle>
          <GenerateInvoiceDialog studentId={student.id} classId={student.classId} />
        </CardHeader>
        <CardContent>
          <QueryBoundary query={invoicesQuery} isEmpty={(d) => d.length === 0}>
            {(invoices) => <StudentInvoicesTable invoices={invoices} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      {/* Phase 6 Slice 12 (Part E — Credit Balance Forward frontend) — one
          more stacked Card, same CardHeader/CardTitle/CardContent
          convention as every card here, inserted between Billing and
          Receipts per the plan's own explicit placement instruction. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("creditBalanceTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreditBalanceCard studentId={student.id} />
        </CardContent>
      </Card>

      {/* Phase 6 Slice 4 (Payments core loop) — one more stacked Card, same
          CardHeader/CardTitle/CardContent convention as every card above
          (no tabs exist in this design system, per the plan), showing this
          student's receipts (`GET /payments/receipts?studentId=`). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("receiptsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={receiptsQuery} isEmpty={(d) => d.length === 0}>
            {(receipts) => <ReceiptsTable receipts={receipts} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      {/* Phase 6 Slice 11 (Part 2) — one more stacked Card, same
          CardHeader/CardTitle/CardContent convention as every card above,
          showing (or offering to provision) this student's wallet. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("walletTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <WalletCard studentId={student.id} />
        </CardContent>
      </Card>
    </>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("students.detail");
  const studentQuery = useStudent(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/students">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      {/* `useSearchParams()` (inside GuardianStatusBanner) requires a
          Suspense boundary per Next.js App Router's own documented
          requirement — no precedent for this elsewhere in this codebase
          (grepped first), so this is the first real usage. */}
      <React.Suspense fallback={null}>
        <GuardianStatusBanner />
      </React.Suspense>

      <QueryBoundary query={studentQuery}>{(student) => <StudentDetail student={student} />}</QueryBoundary>
    </div>
  );
}
