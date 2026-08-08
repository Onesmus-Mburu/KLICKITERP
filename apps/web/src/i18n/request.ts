import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

/**
 * i18n SCAFFOLDING ONLY, per this slice's explicit scope (docs/phase-6/PROGRESS.md):
 * `en` is fully populated for every string this slice introduces; `sw`
 * (Swahili) and `fr` (French) are structurally present with the IDENTICAL
 * key set (see `messages/*.json`) but left as English placeholder values —
 * real translation is future work, not this slice.
 *
 * No `[locale]` route-segment/middleware is built this slice either
 * (locale ROUTING/switching UI is future work) — locale resolution here is
 * a single `NEXT_LOCALE` cookie read with an `en` default, just enough for
 * `next-intl`'s App-Router-native ICU message format to be wired end to end
 * and ready for a future pass to add real routing/a language switcher on
 * top without restructuring anything.
 */
export const SUPPORTED_LOCALES = ["en", "sw", "fr"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: SupportedLocale = SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)
    ? (cookieLocale as SupportedLocale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
