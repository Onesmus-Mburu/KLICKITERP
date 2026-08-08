"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslations } from "next-intl";

interface VerificationQrProps {
  token: string | null;
}

/**
 * Renders a QR code linking to `/verify/[token]` (this app's own new public
 * verification page, `app/verify/[token]/page.tsx`) plus a small caption,
 * for the two real print views. Renders nothing at all when `token` is
 * `null` — a pre-existing receipt/fee-structure minted before this feature
 * shipped genuinely has no token, and a broken/empty QR placeholder would
 * be worse than showing nothing.
 *
 * The verification URL is deliberately built from `window.location.origin`
 * at render time, NEVER a hardcoded/`NEXT_PUBLIC_*` base URL: this app is
 * single-tenant-per-school, so the browser's own origin at print time IS
 * that specific school's real instance hostname — the QR code's target
 * domain is itself part of the proof of which school issued the document,
 * and `/verify/[token]` re-confirms the token against that same instance's
 * own database.
 *
 * `window` doesn't exist during SSR (this is a `"use client"` component,
 * but Next still server-renders it for the initial HTML) — computed in a
 * `useEffect` + local state instead of directly at render time, so the
 * first client render matches the server's (null) render and only updates
 * post-mount, avoiding a hydration mismatch rather than crashing on
 * `window` during SSR.
 */
export function VerificationQr({ token }: VerificationQrProps) {
  const t = useTranslations("documentVerification.qr");
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (token) {
      setUrl(`${window.location.origin}/verify/${token}`);
    } else {
      setUrl(null);
    }
  }, [token]);

  if (!token || !url) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <QRCodeSVG value={url} size={96} />
      <span className="max-w-[120px] text-center text-[10px] leading-tight text-muted-foreground">{t("caption")}</span>
    </div>
  );
}
