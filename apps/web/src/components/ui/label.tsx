import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const labelVariants = cva("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70");

/**
 * Phase 6 Slice 2b item 3 — an optional `required` boolean renders a
 * trailing `*` (destructive-colored, `aria-hidden` since the visual marker
 * is decorative — the real requiredness signal for assistive tech is each
 * input's own `required`/`aria-required` attribute, already present at
 * every call site this marker is added to). Every call site that passes
 * `required` was checked against the REAL `CreateStudentDtoSchema`/
 * `CreateGuardianDtoSchema`/`LinkGuardianDtoSchema` zod schemas
 * (`@klickit/contracts`) — a field with `.optional()` never gets this prop.
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props}>
    {children}
    {required && (
      <span aria-hidden className="ml-0.5 text-destructive">
        *
      </span>
    )}
  </LabelPrimitive.Root>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
