import { NextResponse } from "next/server";
import { getCurrentThemeServer } from "@/lib/theme-server";

/**
 * Thin same-origin JSON wrapper around the public `GET /branding/theme/current`
 * backend call (see `lib/theme-server.ts`'s own doc comment for why the
 * fetch logic lives there, shared with `app/layout.tsx`'s SSR injection
 * rather than duplicated). Exists for client components that want to
 * re-fetch branding without knowing `NEXT_PUBLIC_API_BASE_URL` directly
 * (e.g. a future "branding was just republished" refresh action).
 */
export async function GET() {
  const theme = await getCurrentThemeServer();
  return NextResponse.json(theme);
}
