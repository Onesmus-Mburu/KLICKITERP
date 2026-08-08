import { redirect } from "next/navigation";

/** `<AuthGuard>` (inside `(erp)/layout.tsx`) bounces to `/login` if the session doesn't resolve — this root route just picks a starting point. */
export default function RootPage() {
  redirect("/dashboard");
}
