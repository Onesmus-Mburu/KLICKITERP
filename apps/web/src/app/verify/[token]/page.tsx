import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, XCircle } from "lucide-react";
import { getCurrentThemeServer } from "@/lib/theme-server";
import { verifyDocumentServer } from "@/lib/document-verification-server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Document Verification",
};

interface VerifyDocumentPageProps {
  params: Promise<{ token: string }>;
}

/** `PAYMENT_RECEIPT` -> `Payment Receipt` — a generic humanizer, not a
 * per-`documentType` hardcoded lookup table, so this page never needs to
 * know about a new document type a future minting caller introduces. */
function humanizeDocumentType(type: string): string {
  return type
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** `receiptDate` -> `Receipt date`, `className` -> `Class name` — same
 * "render generically" reasoning: `summary`'s shape genuinely varies per
 * document type (`VerifyDocumentResponseDto.summary` is `Record<string, unknown>`
 * on purpose), so this page renders whatever keys it's handed rather than
 * hardcoding a per-type field list. */
function humanizeSummaryKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function formatSummaryValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Genuinely public, unauthenticated route — `app/verify/[token]/page.tsx`
 * lives OUTSIDE both `(erp)` and `(auth)` route groups (a real, new
 * top-level segment), so it renders with nothing but the root
 * `app/layout.tsx` wrapping it: no `<AuthGuard>`, no `Sidebar`/`Topbar`
 * chrome, no auth gate to route around. Mirrors `(auth)/layout.tsx`'s own
 * `async` server-component shape (calls `getCurrentThemeServer()` the same
 * way), plus this feature's own `verifyDocumentServer()`
 * (`lib/document-verification-server.ts`) for the actual lookup.
 *
 * This page ALWAYS returns a real `200` — for both a resolvable token
 * (`verifyDocumentServer()` returns the real summary) and an unresolvable
 * one (`null`, whether from a genuine `404` on a garbage/unknown token or a
 * total fetch failure). A deliberate choice, not a default: the whole
 * security value of this page is that a fabricated/altered document's QR
 * either won't resolve or won't match what's printed on the document, and
 * that must read as an unambiguous, first-class "Not Verified" RESULT —
 * not a broken page. Routing to a hard Next.js `notFound()` for an unknown
 * token would blur that distinction (a real Next 404 page looks like "this
 * page doesn't exist," not "this document could not be verified") and
 * would also be indistinguishable from this route itself being
 * misconfigured — the wrong signal for a page whose entire job is to give
 * an unambiguous verdict.
 */
export default async function VerifyDocumentPage({ params }: VerifyDocumentPageProps) {
  const { token } = await params;
  const [t, theme, result] = await Promise.all([
    getTranslations("documentVerification.page"),
    getCurrentThemeServer(),
    verifyDocumentServer(token),
  ]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed, expiring MinIO URL isn't a static asset next/image can profitably optimize/cache (same precedent as sidebar.tsx).
            <img src={theme.logoUrl} alt="" className="h-10 w-10 rounded-[4px] object-contain" />
          ) : (
            <span aria-hidden className="h-3 w-3 rotate-45 rounded-[2px] bg-brand-accent" />
          )}
          <span className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-family)" }}>
            {theme.name}
          </span>
        </div>

        {result ? (
          <Card className="border-success/50">
            <CardHeader className="items-center gap-1 text-center">
              <CheckCircle2 className="size-12 text-success" aria-hidden />
              <CardTitle className="text-xl font-semibold text-success">{t("verifiedTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("verifiedDescription")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-tint-success p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-success">{humanizeDocumentType(result.documentType)}</p>
                <p className="text-base font-semibold text-foreground">{result.documentRef}</p>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("summaryTitle")}</p>
                <div className="space-y-0">
                  {Object.entries(result.summary).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
                      <span className="text-xs text-muted-foreground">{humanizeSummaryKey(key)}</span>
                      <span className="text-sm font-medium text-foreground">{formatSummaryValue(value)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 py-2">
                    <span className="text-xs text-muted-foreground">{t("issuedAtLabel")}</span>
                    <span className="text-sm font-medium text-foreground">{new Date(result.issuedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-destructive/50">
            <CardHeader className="items-center gap-1 text-center">
              <XCircle className="size-12 text-destructive" aria-hidden />
              <CardTitle className="text-xl font-semibold text-destructive">{t("notVerifiedTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("notVerifiedDescription")}</p>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-tint-destructive p-4 text-sm text-destructive">{t("notVerifiedHint")}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
