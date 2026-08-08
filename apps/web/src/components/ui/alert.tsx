import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-xl border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg+div]:pl-7", {
  variants: {
    variant: {
      default: "bg-background text-foreground border-border",
      destructive: "border-destructive/50 text-destructive [&>svg]:text-destructive bg-destructive/5",
      warning: "border-warning/50 text-warning-foreground bg-warning/10",
      // Phase 6 Slice 2c — new variant, same shape as `destructive`/`warning`
      // above, for the "linked to an existing (sibling) guardian" /
      // "new guardian created" confirmation notes (guardian-link-dialog.tsx,
      // student-form.tsx, bulk-import-dialog.tsx's per-row summary).
      success: "border-success/50 text-success [&>svg]:text-success bg-success/5",
    },
  },
  defaultVariants: { variant: "default" },
});

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />,
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
