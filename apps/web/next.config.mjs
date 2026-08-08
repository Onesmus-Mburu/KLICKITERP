import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // apps/web talks to apps/api exclusively via the typed @klickit/contracts
  // client from the browser (TanStack Query) — no Next.js rewrite/proxy is
  // used for business data, per ADR-004. The only server-side fetch in this
  // app is the theme route (app/api/theme/route.ts) and the three auth
  // token-plumbing route handlers (app/api/auth/*).
};

export default withNextIntl(nextConfig);
