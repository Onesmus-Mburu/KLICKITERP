import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthorityGuard } from "../infrastructure/guards/authority.guard";
import { AuthorizationException } from "../../../shared/exceptions/authorization.exception";
import { Money } from "../../../shared/money/money";

function makeContext(body: Record<string, unknown>, user: { sub: string } | undefined, requiresCheck: boolean): {
  context: ExecutionContext;
  reflector: Reflector;
} {
  const reflector = { getAllAndOverride: jest.fn(() => requiresCheck) } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ body, user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, reflector };
}

describe("AuthorityGuard", () => {
  let userRepository: { findById: jest.Mock };
  let guard: AuthorityGuard;

  beforeEach(() => {
    userRepository = { findById: jest.fn() };
  });

  it("skips the check when the handler isn't annotated with @RequireAuthorityCheck", async () => {
    const { context, reflector } = makeContext({ amount: "1000.0000" }, { sub: "user-1" }, false);
    guard = new AuthorityGuard(reflector, userRepository as never);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it("skips the check when the DTO has no `amount` field (convention: nothing to compare)", async () => {
    const { context, reflector } = makeContext({}, { sub: "user-1" }, true);
    guard = new AuthorityGuard(reflector, userRepository as never);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("allows a request within the user's authority limit", async () => {
    userRepository.findById.mockResolvedValue({ authorityLimitAmount: Money.fromDecimalString("50000.0000") });
    const { context, reflector } = makeContext({ amount: "40000.0000" }, { sub: "user-1" }, true);
    guard = new AuthorityGuard(reflector, userRepository as never);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("blocks a request exceeding the user's authority limit (FR-USER-005.1)", async () => {
    userRepository.findById.mockResolvedValue({ authorityLimitAmount: Money.fromDecimalString("50000.0000") });
    const { context, reflector } = makeContext({ amount: "75000.0000" }, { sub: "user-1" }, true);
    guard = new AuthorityGuard(reflector, userRepository as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(AuthorizationException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      details: expect.objectContaining({ code: "AUTHORITY_LIMIT_EXCEEDED", overrideRequired: true }),
    });
  });

  it("allows unrestricted access when the user has no configured authority limit", async () => {
    userRepository.findById.mockResolvedValue({ authorityLimitAmount: null });
    const { context, reflector } = makeContext({ amount: "999999.0000" }, { sub: "user-1" }, true);
    guard = new AuthorityGuard(reflector, userRepository as never);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
