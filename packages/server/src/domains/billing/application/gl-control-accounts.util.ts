import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { GlAccountControlDomain, GlAccountEntity, GlAccountRepository } from "../../../accounting";

/**
 * Control-account resolution (task brief "Control account resolution"):
 * `gl_account.control_domain` values include `AR_STUDENT`/`AR_SPONSOR` —
 * every P-01..P-04 posting in this module resolves the AR-Student/AR-Sponsor
 * control account by querying `GlAccountRepository` for the account tagged
 * with the matching `control_domain`. The seeded Chart of Accounts (Module 7
 * foundation, `0900-seed-permissions-and-roles.ts`) is expected to carry
 * exactly one ACTIVE, POSTABLE account per control domain — if zero or more
 * than one such account is found, that is a configuration error, surfaced as
 * `NotFoundException`/`ConflictException` respectively (never silently
 * picking one), per the task brief's explicit instruction.
 */
export async function resolveControlAccount(
  glAccountRepository: GlAccountRepository,
  domain: GlAccountControlDomain,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  const candidates = await glAccountRepository.findByControlDomain(domain, manager);
  const eligible = candidates.filter((account) => account.isActive && account.isPostable);

  if (eligible.length === 0) {
    throw new NotFoundException(
      "GlAccount(control_domain)",
      `${domain} — no active, postable gl_account is tagged with this control_domain; seed/configure the Chart of Accounts`,
    );
  }
  if (eligible.length > 1) {
    throw new ConflictException(
      `GL configuration error: ${eligible.length} active, postable gl_account rows are tagged control_domain=${domain} ` +
        `(expected exactly one) — ids: ${eligible.map((a) => a.id).join(", ")}`,
    );
  }
  return eligible[0];
}
