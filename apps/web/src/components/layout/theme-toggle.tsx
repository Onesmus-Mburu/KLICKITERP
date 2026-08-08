"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Light/Dark/System toggle over the CSS-variable-driven theme
 * (`app/layout.tsx`'s SSR-injected `:root`/`:root[data-theme="dark"]`
 * blocks). `next-themes` toggles the `data-theme` attribute this app's
 * Tailwind `darkMode` config is keyed on; "system" defers to the browser's
 * own `prefers-color-scheme` media query, which `next-themes` resolves and
 * mirrors onto that same attribute automatically.
 */
export function ThemeToggle() {
  const t = useTranslations("shell.theme");
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  // Slice 1.5b (visual polish iteration): before hydration, `resolvedTheme`
  // is undefined — falls back to "light" so the SSR-painted icon (`Sun`,
  // matching the old `dark:hidden` default) never mismatches on hydration.
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("toggle")} suppressHydrationWarning>
          {/* Slice 1.5b (visual polish iteration): the old `dark:hidden`/
              `dark:block` pair swapped instantly via a CSS class toggle —
              replaced with an `AnimatePresence` crossfade+rotate so the icon
              swap itself is a real micro-interaction. `mode="wait"` avoids
              both icons being visible mid-transition. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isDark ? "moon" : "sun"}
              initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex"
            >
              {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")} disabled={!mounted}>
          <Sun className="size-4" /> {t("light")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} disabled={!mounted}>
          <Moon className="size-4" /> {t("dark")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} disabled={!mounted}>
          <MonitorSmartphone className="size-4" /> {t("system")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
