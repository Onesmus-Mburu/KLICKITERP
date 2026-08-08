/**
 * Plain string-literal constants mirroring the real backend enums exactly —
 * same `features/wallet/constants.ts`/`features/students/constants.ts`
 * precedent of a small local constants file per feature module rather than
 * importing the server's own arrays (no import path exists from the frontend
 * into `packages/server` anyway).
 */

/** `UsrUserEntity.status` (`packages/server/src/platform/users/domain/usr-user.entity.ts`) — confirmed by reading it directly. */
export const USER_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** `UsrUserEntity.userType` — confirmed by reading it directly. */
export const USER_TYPES = ["STAFF", "PARENT", "SYSTEM"] as const;
export type UserType = (typeof USER_TYPES)[number];

/**
 * Client-side mirror of `UsersService.ALLOWED_TRANSITIONS`
 * (`packages/server/src/platform/users/application/users.service.ts`,
 * confirmed by reading it directly) — used by `UserStatusActions` to compute
 * which status-transition buttons to show for a given user's CURRENT status.
 * `DEACTIVATED` is the real terminal state: zero legal transitions out.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<UserStatus, readonly UserStatus[]> = {
  INVITED: ["ACTIVE", "DEACTIVATED"],
  ACTIVE: ["SUSPENDED", "DEACTIVATED"],
  SUSPENDED: ["ACTIVE", "DEACTIVATED"],
  DEACTIVATED: [],
};

/**
 * There are 3 separate no-body verb endpoints (`PATCH .../suspend`/
 * `:reactivate`/`:deactivate`), not one PATCH-with-a-status-body endpoint —
 * this maps each reachable TARGET status back to which verb produces it, so
 * `UserStatusActions` can render the right confirm-dialog-gated button for
 * each entry `ALLOWED_STATUS_TRANSITIONS[user.status]` lists. `INVITED` never
 * appears as a target (nothing transitions INTO it) so it's omitted here.
 */
export const TARGET_STATUS_TO_VERB: Record<Exclude<UserStatus, "INVITED">, "suspend" | "reactivate" | "deactivate"> = {
  ACTIVE: "reactivate",
  SUSPENDED: "suspend",
  DEACTIVATED: "deactivate",
};

/**
 * Mirrors `apps/web/src/i18n/request.ts`'s own `SUPPORTED_LOCALES` — hand-
 * duplicated rather than imported, because that file reads `next/headers`'
 * `cookies()` (server-only) and can't be imported into this client feature
 * module, the same "hand-mirror a catalogue that lives in an unimportable
 * file" precedent `features/roles/constants.ts`'s own `PERMISSION_MODULES`
 * doc comment already established for a different reason (no endpoint to
 * fetch it from, there; a server-only import barrier, here).
 */
export const LOCALE_OPTIONS = ["en", "sw", "fr"] as const;
export type LocaleOption = (typeof LOCALE_OPTIONS)[number];
