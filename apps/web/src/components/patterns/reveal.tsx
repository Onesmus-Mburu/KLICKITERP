"use client";

import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

/**
 * Slice 1.5b (visual polish iteration) — a small fade+rise mount wrapper,
 * used to stagger the dashboard's chart/table/summary `<Card>`s in
 * (erp)/dashboard/page.tsx. `<KpiCard>` animates itself internally (see its
 * own doc comment) since it has its own natural per-widget mount timing;
 * this wrapper is for the other Card-based sections that don't own their
 * own animation. See `lib/motion.ts` for the reduced-motion handling this
 * relies on (`<MotionConfig reducedMotion="user">` in `app/providers.tsx`).
 */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} variants={fadeInUp} custom={delay} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}
