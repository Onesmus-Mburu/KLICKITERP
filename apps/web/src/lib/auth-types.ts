/**
 * Mirrors `AuthService`'s real `PublicUser`/`LoginOutcome` shapes
 * (`packages/server/src/platform/auth/application/auth.service.ts`) —
 * `packages/contracts`' generated zod coverage doesn't include these two
 * interfaces (they're plain TS return types, not class-validator DTOs), so
 * this is the one narrow, deliberate hand-mirror in this app; every actual
 * REQUEST body still goes through a real `@klickit/contracts` zod schema
 * (`LoginDtoSchema`, `TwoFactorVerifyDtoSchema`, etc.).
 */
export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  userType: string;
  roles: string[];
}

export interface LoginOutcome {
  stage: "2fa" | "complete";
  preauthToken?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: PublicUser;
  mustChangePassword?: boolean;
}
