import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { LicenseStateGuard } from "../license-state.guard";
import { LicenseDeactivatedException, LicenseSuspendedException } from "../../exceptions/license-suspended.exception";

function makeContext(method: string, isExempt: boolean): { context: ExecutionContext; reflector: Reflector } {
  const reflector = { getAllAndOverride: jest.fn(() => isExempt) } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, reflector };
}

describe("LicenseStateGuard", () => {
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    LicenseStateGuard.resetCacheForTests();
    dataSource = { query: jest.fn() };
  });

  it("allows any request/state when the handler is @ExemptFromLicenseGuard()", async () => {
    const { context, reflector } = makeContext("POST", true);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it("allows requests when ACTIVE", async () => {
    dataSource.query.mockResolvedValue([{ state: "ACTIVE" }]);
    const { context, reflector } = makeContext("POST", false);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("SUSPENDED: allows GET (reads are never blocked, BR-LIC-01)", async () => {
    dataSource.query.mockResolvedValue([{ state: "SUSPENDED" }]);
    const { context, reflector } = makeContext("GET", false);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("SUSPENDED: blocks a non-GET mutation on a non-exempt endpoint with 403 LICENSE_SUSPENDED", async () => {
    dataSource.query.mockResolvedValue([{ state: "SUSPENDED" }]);
    const { context, reflector } = makeContext("POST", false);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(LicenseSuspendedException);
  });

  it("SUSPENDED: a mutation on an @ExemptFromLicenseGuard() endpoint (auth/export/backup) still passes", async () => {
    dataSource.query.mockResolvedValue([{ state: "SUSPENDED" }]);
    const { context, reflector } = makeContext("POST", true);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("DEACTIVATED: blocks every non-exempt request, including GET, with 403 LICENSE_DEACTIVATED", async () => {
    dataSource.query.mockResolvedValue([{ state: "DEACTIVATED" }]);
    const { context, reflector } = makeContext("GET", false);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(LicenseDeactivatedException);
  });

  it("DEACTIVATED: an @ExemptFromLicenseGuard() endpoint (auth/export/backup) still passes, any method", async () => {
    dataSource.query.mockResolvedValue([{ state: "DEACTIVATED" }]);
    const { context, reflector } = makeContext("POST", true);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("EXPIRED is treated at least as restrictively as SUSPENDED (mutations blocked)", async () => {
    dataSource.query.mockResolvedValue([{ state: "EXPIRED" }]);
    const { context, reflector } = makeContext("POST", false);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(LicenseSuspendedException);
  });

  it("fails open (allows the request) when license.v_state is unreachable", async () => {
    dataSource.query.mockRejectedValue(new Error("relation \"license.v_state\" does not exist"));
    const { context, reflector } = makeContext("POST", false);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("fails open when no license row has ever been provisioned (empty result set)", async () => {
    dataSource.query.mockResolvedValue([]);
    const { context, reflector } = makeContext("POST", false);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("caches the state across calls within the TTL — a second request within the window makes no new DB query", async () => {
    dataSource.query.mockResolvedValue([{ state: "ACTIVE" }]);
    const { context, reflector } = makeContext("GET", false);
    const guard = new LicenseStateGuard(reflector, dataSource as never);

    await guard.canActivate(context);
    await guard.canActivate(context);

    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });
});
