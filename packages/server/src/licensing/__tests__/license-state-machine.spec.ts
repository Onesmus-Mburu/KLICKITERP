import { deriveState, LicenseWindow } from "../application/license-state-machine";

describe("deriveState — date-window state machine", () => {
  const window: LicenseWindow = { validFrom: "2026-01-01", validTo: "2026-06-30", graceDays: 14 };

  it("stays PROVISIONED before valid_from", () => {
    expect(deriveState("PROVISIONED", window, new Date("2025-12-31T00:00:00.000Z"))).toBe("PROVISIONED");
  });

  it("becomes ACTIVE once inside the valid window", () => {
    expect(deriveState("PROVISIONED", window, new Date("2026-03-15T00:00:00.000Z"))).toBe("ACTIVE");
    expect(deriveState("PROVISIONED", window, new Date("2026-06-30T23:59:59.999Z"))).toBe("ACTIVE");
  });

  it("becomes GRACE just after valid_to, within grace_days", () => {
    expect(deriveState("ACTIVE", window, new Date("2026-07-01T00:00:00.000Z"))).toBe("GRACE");
    expect(deriveState("ACTIVE", window, new Date("2026-07-14T23:59:59.999Z"))).toBe("GRACE");
  });

  it("becomes SUSPENDED once grace_days is exceeded", () => {
    expect(deriveState("GRACE", window, new Date("2026-07-15T00:00:01.000Z"))).toBe("SUSPENDED");
    expect(deriveState("GRACE", window, new Date("2026-08-01T00:00:00.000Z"))).toBe("SUSPENDED");
  });

  it("never auto-derives away from DEACTIVATED (terminal, manual-only)", () => {
    expect(deriveState("DEACTIVATED", window, new Date("2026-03-15T00:00:00.000Z"))).toBe("DEACTIVATED");
  });

  it("never auto-derives away from EXPIRED (terminal, manual-only)", () => {
    expect(deriveState("EXPIRED", window, new Date("2026-03-15T00:00:00.000Z"))).toBe("EXPIRED");
  });

  it("re-derives ACTIVE from a stale SUSPENDED once the window is renewed further out", () => {
    const renewed: LicenseWindow = { validFrom: "2026-01-01", validTo: "2099-01-01", graceDays: 14 };
    expect(deriveState("SUSPENDED", renewed, new Date("2026-03-15T00:00:00.000Z"))).toBe("ACTIVE");
  });
});
