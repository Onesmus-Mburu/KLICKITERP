import { ImageResponse } from "next/og";
import { getCurrentThemeServer } from "@/lib/theme-server";

/**
 * Slice 14 Part 3 — dynamic Next.js icon route (App Router file convention:
 * `app/icon.tsx`). Confirmed before writing this file that no
 * `favicon.ico`/`app/icon.*` existed anywhere in this app; a browser's own
 * favicon request carries no bearer token/cookie at all, so it can only
 * ever be resolved via the public, pre-auth `GET /branding/theme/current`
 * bundle — specifically its new `faviconUrl` field (a signed MinIO URL
 * `ThemesService` already resolved in-process server-side).
 *
 * When a theme has a real uploaded favicon, this route proxies those bytes
 * directly (a plain server-side `fetch` against the signed URL, forwarding
 * the real `Content-Type` the storage layer returned) rather than
 * redirecting the browser to the signed URL — the URL is time-limited
 * (86400s) and MinIO-hosted, neither of which a browser's favicon cache
 * should be coupled to.
 *
 * When no favicon is configured (or the signed URL fails to resolve — same
 * graceful-degradation discipline as the backend's own `toBundle()`, a
 * broken reference must not break the tab icon), falls back to a small
 * `next/og`-generated placeholder reusing the sidebar's own diamond motif
 * (`components/layout/sidebar.tsx`), rendered in the resolved theme's real
 * `tokens.colors.accent` — never a hardcoded hex — so a published theme's
 * own color choice shows up even in the generated fallback.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const theme = await getCurrentThemeServer();

  if (theme.faviconUrl) {
    try {
      const res = await fetch(theme.faviconUrl);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        return new Response(bytes, {
          headers: {
            "Content-Type": res.headers.get("content-type") ?? "image/png",
          },
        });
      }
    } catch {
      // Falls through to the generated placeholder below — a broken/expired
      // signed URL must not break the browser tab icon.
    }
  }

  const accent = theme.tokens.colors.accent;
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            transform: "rotate(45deg)",
            background: accent,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
