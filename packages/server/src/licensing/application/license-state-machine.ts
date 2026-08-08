import { LicenseState } from "../domain/license.entity";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface LicenseWindow {
  /** ISO date string (`date` column), e.g. `"2026-01-01"`. */
  validFrom: string;
  validTo: string;
  graceDays: number;
}

/**
 * Pure date-window state derivation shared by `LicenseFileService`
 * (applying/re-checking a license file) and `LicenseApiService` (the
 * mutual-auth API's `activate`/`renew` handlers) — both channels manage the
 * SAME `license.license` row and must never disagree about what a given
 * `(state, valid_from, valid_to, grace_days, now)` tuple resolves to.
 *
 * `PROVISIONED -> ACTIVE -> GRACE -> SUSPENDED` is fully auto-derived from
 * the date window (FR-LIC-001.1's own transition list). `DEACTIVATED` and
 * `EXPIRED` are treated as manual/terminal states this function never
 * overrides once reached — `DEACTIVATED` only via `LicenseApiService.deactivate()`
 * (the one and only path to it, per the 9 enumerated handlers — no
 * "reactivate from DEACTIVATED" handler exists, matching FR-LIC-002.1's
 * exhaustive endpoint list); `EXPIRED` has no path that reaches it anywhere
 * in this pass at all (a documented judgement call — the DDL's CHECK
 * constraint reserves the value, but neither FR-LIC-001.1's date-window
 * transitions nor any of the 9 handlers ever set it, so it stays reachable
 * only via a future explicit lifecycle path or a manual DB correction; see
 * docs/phase-5/PROGRESS.md).
 */
export function deriveState(current: LicenseState, window: LicenseWindow, now: Date): LicenseState {
  if (current === "DEACTIVATED" || current === "EXPIRED") {
    return current;
  }

  const validFromMs = Date.parse(`${window.validFrom}T00:00:00.000Z`);
  const validToMs = Date.parse(`${window.validTo}T23:59:59.999Z`);
  const nowMs = now.getTime();

  if (nowMs < validFromMs) {
    return "PROVISIONED";
  }
  if (nowMs <= validToMs) {
    return "ACTIVE";
  }
  const graceEndMs = validToMs + window.graceDays * MS_PER_DAY;
  if (nowMs <= graceEndMs) {
    return "GRACE";
  }
  return "SUSPENDED";
}
