import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticationException } from "../../../../shared/exceptions/authentication.exception";
import { AuthorizationException } from "../../../../shared/exceptions/authorization.exception";
import { AUTHORITY_CHECK_METADATA_KEY } from "../../../../shared/rbac/require-authority-check.decorator";
import { Money } from "../../../../shared/money/money";
import { AuthUsrUserRepository } from "../usr-user.repository";
import { RequestUser } from "./jwt-auth.guard";

interface MinimalHttpRequest {
  user?: RequestUser;
  body?: { amount?: unknown };
}

/**
 * Third guard in the pipeline (§2.3): FR-USER-005.1 monetary-limit check.
 * Convention: the DTO must expose a decimal-string `amount` field for the
 * guard to evaluate — handlers whose DTO has no `amount` are skipped
 * (nothing to compare), so `@RequireAuthorityCheck()` is safe to apply
 * broadly without breaking non-monetary endpoints that happen to share a
 * controller. Blocks with a structured response naming the limit and
 * requested amount; the "named-supervisor override" flow itself is
 * out of scope for Module 1 (no endpoints in this module are monetary) —
 * only the block + error shape are implemented, per the task's own scope
 * note.
 */
@Injectable()
export class AuthorityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userRepository: AuthUsrUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresCheck = this.reflector.getAllAndOverride<boolean | undefined>(AUTHORITY_CHECK_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiresCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest<MinimalHttpRequest>();
    const rawAmount = request.body?.amount;
    if (typeof rawAmount !== "string") {
      return true; // DTO exposes no `amount` — nothing to check, guard is a no-op.
    }

    const user = request.user;
    if (!user) {
      throw new AuthenticationException("Authentication required");
    }

    const dbUser = await this.userRepository.findById(user.sub);
    const limit = dbUser?.authorityLimitAmount ?? null;
    if (!limit) {
      return true; // no limit configured for this user — unrestricted.
    }

    const requested = Money.fromDecimalString(rawAmount);
    if (requested.compare(limit) > 0) {
      throw new AuthorizationException(
        `Requested amount ${requested.toDecimalString()} exceeds authority limit ${limit.toDecimalString()}`,
        {
          code: "AUTHORITY_LIMIT_EXCEEDED",
          limit: limit.toDecimalString(),
          requested: requested.toDecimalString(),
          overrideRequired: true,
          overrideNote: "Named-supervisor dual-credential override is not implemented in Module 1",
        },
      );
    }
    return true;
  }
}
