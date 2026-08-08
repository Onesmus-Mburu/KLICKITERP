import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_METADATA_KEY = "isPublic";

/**
 * Opts an endpoint out of the `JwtAuthGuard`/`PermissionsGuard`/`AuthorityGuard`
 * `APP_GUARD` pipeline (auth.module.ts) — for the handful of auth endpoints
 * that run *before* a caller has any credentials at all (login, 2FA verify,
 * refresh, OTP request/verify, password forgot/reset).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_METADATA_KEY, true);
