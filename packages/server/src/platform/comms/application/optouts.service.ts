import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { CommChannel } from "../domain/comm-template.entity";
import { CommOptoutEntity } from "../domain/comm-optout.entity";
import { CommOptoutRepository } from "../infrastructure/comm-optout.repository";

export interface CreateOptoutInput {
  guardianId: string;
  channel: CommChannel;
  scope: string;
}

/**
 * CRUD/check for `comm_optout`. `guardianId` is deliberately untyped beyond
 * "a uuid" here — see `CommOptoutEntity`'s doc comment: there is no
 * `students`/guardians module (#8) yet to validate it against, so this
 * service never looks it up, only stores/queries it verbatim.
 */
@Injectable()
export class OptoutsService {
  constructor(private readonly optoutRepository: CommOptoutRepository) {}

  async create(input: CreateOptoutInput, actorId: string | null): Promise<CommOptoutEntity> {
    if (await this.optoutRepository.findOne(input.guardianId, input.channel, input.scope)) {
      throw new ConflictException(
        `Opt-out already exists: guardian=${input.guardianId} channel=${input.channel} scope=${input.scope}`,
      );
    }
    return this.optoutRepository.create({
      guardianId: input.guardianId,
      channel: input.channel,
      scope: input.scope,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async listByGuardian(guardianId: string): Promise<CommOptoutEntity[]> {
    return this.optoutRepository.listByGuardian(guardianId);
  }

  async delete(id: string): Promise<void> {
    await this.optoutRepository.findByIdOrFail(id);
    await this.optoutRepository.deleteById(id);
  }

  /** `NotificationsService.send()`'s opt-out gate — exact `(guardianId, channel, scope)` match, no broader-scope inference. */
  async isOptedOut(guardianId: string, channel: CommChannel, scope: string): Promise<boolean> {
    return (await this.optoutRepository.findOne(guardianId, channel, scope)) !== null;
  }
}
