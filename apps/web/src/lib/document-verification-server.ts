import "server-only";
import type { VerifyDocumentResponseDto } from "@klickit/contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

/**
 * Server-only fetch of the public `GET /document-verification/:token` (no
 * auth — `@Public()` on `DocumentVerificationController.verify`). Mirrors
 * `lib/theme-server.ts`'s `getCurrentThemeServer()` shape (`server-only`
 * import, direct fetch against the real API base URL) but is deliberately
 * SIMPLER: `theme-server.ts` needs an elaborate fallback bundle because
 * branding chrome must always render SOMETHING even if the API is
 * unreachable. Here, a failed/404 fetch is itself a real, correctly
 * renderable state ("not verified") — not an error to hide behind a
 * fallback. `null` is returned uniformly for a genuine 404 (unknown/garbage
 * token) AND a total fetch failure (network error, API down); the caller
 * (`app/verify/[token]/page.tsx`) renders the same unambiguous
 * "Not Verified" state for either case, which is exactly right for a
 * security-purpose page — a document whose verification can't be confirmed
 * must never look ambiguous or apologetic.
 *
 * `cache: "no-store"` — verification results must always be fetched fresh,
 * never served stale from Next's fetch cache (unlike branding chrome,
 * which tolerates a short `revalidate` window).
 */
export async function verifyDocumentServer(token: string): Promise<VerifyDocumentResponseDto | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/document-verification/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as VerifyDocumentResponseDto;
  } catch {
    return null;
  }
}
