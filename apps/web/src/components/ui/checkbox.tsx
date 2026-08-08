import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Hand-authored native `<input type="checkbox">` primitive (Phase 6 Slice 8
 * — this app's own "every UI primitive is hand-authored" convention, see
 * `input.tsx`/`dropdown-menu.tsx`'s own doc comments for why no
 * `pnpm dlx shadcn@latest add` CLI flow is used in this non-interactive
 * environment). Deliberately a REAL native checkbox
 * (`appearance-none` + a manually-drawn check glyph shown via the `peer`
 * pattern) rather than a `@radix-ui/react-checkbox` wrapper — no new npm
 * dependency needed for a simple boolean toggle, and the native element
 * keeps free keyboard/label/`indeterminate`/form-submission semantics.
 * Same `border-input`/`bg-background`/`focus-visible:ring-ring` token
 * classes as `input.tsx`, so it reads as the same design system.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => (
  <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        "peer size-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-input bg-background transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
    <Check className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100" aria-hidden />
  </span>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
