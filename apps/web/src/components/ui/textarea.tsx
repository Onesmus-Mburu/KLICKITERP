import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Phase 6 Slice 15 Part 1 — the first multi-line text field anywhere in this
 * app's `components/ui/` (confirmed by grepping for `<textarea` before
 * writing this: zero existing usages anywhere in `apps/web/src`). Needed for
 * `comm_template.body` (real, multi-line message content with
 * `{{variableName}}`-style placeholders — see
 * `features/comms/components/create-template-dialog.tsx`) and its optional
 * `variables` JSON field, neither of which fit `<Input>`'s single-line
 * shape. Same hand-authored-native-element convention `checkbox.tsx`/
 * `input.tsx` already establish (see those files' own doc comments for why
 * no `pnpm dlx shadcn@latest add` CLI flow is used in this non-interactive
 * environment), same `border-input`/`bg-background`/`focus-visible:ring-ring`
 * token classes as `input.tsx` so it reads as the same design system.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
