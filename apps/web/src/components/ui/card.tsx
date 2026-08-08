import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  // Slice 1.5b (visual polish iteration): a subtle shadow lift on hover
  // (plain CSS transition, respected by app/globals.css's existing
  // `prefers-reduced-motion` block) — a depth cue only, no `cursor-pointer`
  // added, so this doesn't falsely imply every card is clickable. Uses
  // Tailwind's arbitrary-value syntax (`shadow-[var(--shadow-card-hover)]`)
  // straight against the `styles/tokens.css` custom property, NOT a new
  // `tailwind.config.ts` theme key: a config-key version of this
  // (`boxShadow: { "card-hover": ... }`) was tried first but never took
  // effect in the already-running dev server (a real, observed limitation
  // — new `tailwind.config.ts` theme keys don't reliably hot-reload into
  // this long-running process's cached config without a full restart,
  // which per this round's explicit instruction not to restart unless the
  // server crashes, wasn't done). Arbitrary-value classes are resolved
  // straight from the class string at scan time with no config lookup, so
  // this takes effect immediately — confirmed via the running server's own
  // compiled CSS output.
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border bg-card text-card-foreground shadow-card transition-shadow duration-200 hover:shadow-[0_4px_8px_0_var(--shadow-color),0_20px_44px_-10px_var(--shadow-color)]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-sm font-medium leading-none text-muted-foreground", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
