import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_METADATA_KEY = "isPublic";

/**
 * Opts an endpoint out of the `JwtAuthGuard`/`PermissionsGuard`/`AuthorityGuard`
 * `APP_GUARD` pipeline (`platform/auth/auth.module.ts`) — for the handful of
 * auth endpoints that run *before* a caller has any credentials at all
 * (login, 2FA verify, refresh, OTP request/verify, password forgot/reset),
 * plus a few other genuinely-unauthenticated callers elsewhere (public theme
 * lookup, anonymous document-verification QR scans, Safaricom's M-Pesa
 * inbound callbacks, licensing's own JWS-mutual-authenticated `/license/v1/*`
 * machine-to-machine surface).
 *
 * Lives under `shared/rbac/` (not `platform/auth/`, where it originally
 * lived) specifically so `licensing` — whose own isolation rule limits it to
 * `mayImport: ["shared"]` only, no exception, per architecture doc §3.3 rule
 * 3 / D5 — can legally use it too, mirroring its own sibling
 * `ExemptFromLicenseGuard` (`shared/rbac/exempt-from-license-guard.decorator.ts`,
 * same `SetMetadata` shape, same class+method applicability, same reason for
 * living here). `platform/auth`'s own `index.ts` barrel re-exports `Public`
 * from here unchanged, so every pre-existing consumer (`auth.controller.ts`,
 * `platform/branding`'s theme endpoint, `platform/document-verification`'s
 * QR endpoint, `domains/payments`' M-Pesa callbacks) needed no import-path
 * change at all.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_METADATA_KEY, true);
