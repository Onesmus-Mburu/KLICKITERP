import { Injectable } from "@nestjs/common";
import { CommChannel } from "../domain/comm-template.entity";
import { CommTriggerBindingEntity } from "../domain/comm-trigger-binding.entity";
import { CommTriggerBindingRepository } from "../infrastructure/comm-trigger-binding.repository";

export interface CreateTriggerBindingInput {
  eventCode: string;
  channel: CommChannel;
  isEnabled?: boolean;
  audienceRule?: unknown;
}

export interface UpdateTriggerBindingInput {
  isEnabled?: boolean;
  audienceRule?: unknown;
}

/**
 * CRUD for `comm_trigger_binding` — which `(eventCode, channel)` pairs are
 * currently wired to send, and an optional `audienceRule` narrowing the
 * recipients. No dispatcher in this codebase reads these rows automatically
 * yet (there is no domain-event-driven trigger engine built) — this service
 * only stores/serves the configuration; a future module wiring business
 * events to `NotificationsService.send()` is the eventual consumer, checking
 * `isEnabled` before it fires.
 */
@Injectable()
export class TriggerBindingsService {
  constructor(private readonly triggerBindingRepository: CommTriggerBindingRepository) {}

  async create(input: CreateTriggerBindingInput, actorId: string | null): Promise<CommTriggerBindingEntity> {
    return this.triggerBindingRepository.create({
      eventCode: input.eventCode,
      channel: input.channel,
      isEnabled: input.isEnabled ?? true,
      audienceRule: input.audienceRule ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(): Promise<CommTriggerBindingEntity[]> {
    return this.triggerBindingRepository.list();
  }

  async findByIdOrFail(id: string): Promise<CommTriggerBindingEntity> {
    return this.triggerBindingRepository.findByIdOrFail(id);
  }

  async update(
    id: string,
    changes: UpdateTriggerBindingInput,
    actorId: string | null,
  ): Promise<CommTriggerBindingEntity> {
    const binding = await this.triggerBindingRepository.findByIdOrFail(id);
    if (changes.isEnabled !== undefined) binding.isEnabled = changes.isEnabled;
    if (changes.audienceRule !== undefined) binding.audienceRule = changes.audienceRule;
    binding.updatedBy = actorId;
    return this.triggerBindingRepository.save(binding);
  }
}
