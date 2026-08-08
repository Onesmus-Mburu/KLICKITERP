import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ApprDelegationEntity } from "../domain/appr-delegation.entity";
import { ApprDelegationRepository } from "../infrastructure/appr-delegation.repository";

export interface CreateDelegationInput {
  fromUserId: string;
  toUserId: string;
  startsOn: string;
  endsOn: string;
  reason?: string | null;
}

export interface UpdateDelegationInput {
  startsOn?: string;
  endsOn?: string;
  reason?: string | null;
}

/**
 * CRUD for `appr_delegation` (FR-APPR-005.1). `resolveEffectiveApprover`
 * is the read path `ApprovalEngineService` calls during `decide()`/
 * `listPendingForApprover()` to find out whether a given legitimate
 * approver has an active delegate on a given date.
 *
 * Deliberately **one-hop only**: if A delegates to B, and B separately
 * delegates to C, resolving A's effective approver returns B, not C — this
 * service does not chase delegation chains recursively. Rationale: nothing
 * in the DDL or FR-APPR-005.1 specifies chain-following semantics, and
 * unbounded chain-following opens the door to cycles (A->B->A) that would
 * require extra guard logic to detect; a single hop covers the documented
 * use case ("during leave") cleanly. Revisit if real usage needs B's own
 * delegate to also cover A's requests while B is away.
 */
@Injectable()
export class DelegationsService {
  constructor(private readonly delegationRepository: ApprDelegationRepository) {}

  async create(input: CreateDelegationInput, actorId: string | null): Promise<ApprDelegationEntity> {
    if (input.fromUserId === input.toUserId) {
      // ck_appr_delegation_from_ne_to — defense-in-depth ahead of the DB CHECK (G-04).
      throw new ValidationException("A delegation cannot target the delegating user themselves");
    }
    if (input.startsOn > input.endsOn) {
      throw new ValidationException("Delegation startsOn must not be after endsOn", {
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      });
    }
    return this.delegationRepository.create({
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      reason: input.reason ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(): Promise<ApprDelegationEntity[]> {
    return this.delegationRepository.list();
  }

  async findByIdOrFail(id: string): Promise<ApprDelegationEntity> {
    return this.delegationRepository.findByIdOrFail(id);
  }

  async update(id: string, changes: UpdateDelegationInput, actorId: string | null): Promise<ApprDelegationEntity> {
    const delegation = await this.delegationRepository.findByIdOrFail(id);
    const startsOn = changes.startsOn ?? delegation.startsOn;
    const endsOn = changes.endsOn ?? delegation.endsOn;
    if (startsOn > endsOn) {
      throw new ValidationException("Delegation startsOn must not be after endsOn", { startsOn, endsOn });
    }
    delegation.startsOn = startsOn;
    delegation.endsOn = endsOn;
    if (changes.reason !== undefined) delegation.reason = changes.reason;
    delegation.updatedBy = actorId;
    return this.delegationRepository.save(delegation);
  }

  async delete(id: string): Promise<void> {
    await this.delegationRepository.findByIdOrFail(id);
    await this.delegationRepository.delete(id);
  }

  /**
   * Returns `toUserId` of `userId`'s active delegation on `onDate` (the
   * first one found, by `startsOn <= onDate <= endsOn`) or `userId` itself
   * if none is active. One hop only — see class doc comment.
   */
  async resolveEffectiveApprover(userId: string, onDate: Date): Promise<string> {
    const dateKey = toDateKey(onDate);
    const delegations = await this.delegationRepository.listByFromUser(userId);
    const active = delegations.find((d) => d.startsOn <= dateKey && dateKey <= d.endsOn);
    return active ? active.toUserId : userId;
  }
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
