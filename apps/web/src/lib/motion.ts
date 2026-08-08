import type { Variants } from "framer-motion";

/**
 * Slice 1.5b (visual polish iteration) — shared Framer Motion primitives.
 * Framer Motion is a mandated stack dependency (`docs/phase-1/SRS.md` 2.6
 * "Mandated stack" + IR-002's "Framer Motion micro-interactions" line) that
 * hadn't been used anywhere in `apps/web` before this pass (confirmed via
 * grep — zero `framer-motion` imports existed).
 *
 * Kept deliberately crisp (180-220ms, `easeOut`, small 8px rise) per this
 * round's own instruction: "this is an ERP finance tool, not a marketing
 * site; motion should feel crisp and fast, never bouncy/playful in a way
 * that undermines trust" — no spring/bounce easing anywhere in this file.
 *
 * Reduced-motion handling: `app/providers.tsx` wraps the whole tree in
 * `<MotionConfig reducedMotion="user">`, which (per framer-motion's own
 * `index.d.ts` doc comment: "will respect the device prefersReducedMotion
 * setting by switching transform animations off") disables transform-based
 * motion (the `y` rise, the layout-pill FLIP) for every `motion.*`/
 * `AnimatePresence` component in the app when the OS/browser
 * `prefers-reduced-motion: reduce` is set — a REAL, library-level guard,
 * not an assumption. This is IN ADDITION TO, not instead of, the existing
 * plain-CSS `@media (prefers-reduced-motion: reduce)` block in
 * `app/globals.css` (which only catches CSS transitions/animations, e.g.
 * the Tailwind `hover:scale-*`/`transition-shadow` utilities added this
 * pass — Framer Motion's JS-driven animations are a separate code path
 * that CSS media queries cannot reach on their own, which is why the
 * explicit `MotionConfig` guard was required rather than assumed).
 */
export const MOTION_DURATION_S = 0.2;

/** Fade + slight rise, with an optional per-item stagger delay via the `custom` prop (Framer Motion variant-function pattern). Delay is capped so a long list never feels sluggish to start reading. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION_S, delay: Math.min(delay, 0.3), ease: "easeOut" },
  }),
};

/** Caps a 0-based index to a small, evenly-spaced stagger delay in seconds. */
export function staggerDelay(index: number, step = 0.045): number {
  return Math.min(index * step, 0.3);
}
