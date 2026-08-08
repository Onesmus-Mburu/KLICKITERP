import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      destructive: "border-transparent bg-destructive text-destructive-foreground",
      success: "border-transparent bg-success text-success-foreground",
      outline: "text-foreground",
      // Slice 1.5 (visual redesign) — softly-tinted status pills
      // (bg-tint-* / text-*), replacing solid-fill badges as the default
      // status treatment per the reference screenshots. Built on the
      // `color-mix()`-derived tint tokens (styles/tokens.css) — no new
      // hardcoded colors.
      "soft-primary": "border-transparent bg-tint-primary text-primary",
      "soft-secondary": "border-transparent bg-tint-secondary text-secondary-foreground",
      "soft-accent": "border-transparent bg-tint-accent text-accent-foreground",
      "soft-success": "border-transparent bg-tint-success text-success",
      "soft-warning": "border-transparent bg-tint-warning text-warning-foreground",
      "soft-destructive": "border-transparent bg-tint-destructive text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
