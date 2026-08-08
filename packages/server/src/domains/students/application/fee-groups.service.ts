import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { StdFeeGroupEntity } from "../domain/std-fee-group.entity";
import { StdFeeGroupRepository } from "../infrastructure/std-fee-group.repository";

export interface CreateStdFeeGroupInput {
  name: string;
  description?: string | null;
}

export interface UpdateStdFeeGroupInput {
  name?: string;
  description?: string | null;
}

/** CRUD for `std_fee_group`. */
@Injectable()
export class FeeGroupsService {
  constructor(private readonly feeGroupRepository: StdFeeGroupRepository) {}

  async create(input: CreateStdFeeGroupInput, actorId: string | null): Promise<StdFeeGroupEntity> {
    if (await this.feeGroupRepository.findByName(input.name)) {
      throw new ConflictException(`std_fee_group name already in use: ${input.name}`);
    }
    return this.feeGroupRepository.create({
      name: input.name,
      description: input.description ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<StdFeeGroupEntity> {
    return this.feeGroupRepository.findByIdOrFail(id);
  }

  async list(): Promise<StdFeeGroupEntity[]> {
    return this.feeGroupRepository.list();
  }

  async update(id: string, changes: UpdateStdFeeGroupInput, actorId: string | null): Promise<StdFeeGroupEntity> {
    const feeGroup = await this.feeGroupRepository.findByIdOrFail(id);
    if (changes.name !== undefined) feeGroup.name = changes.name;
    if (changes.description !== undefined) feeGroup.description = changes.description;
    feeGroup.updatedBy = actorId;
    return this.feeGroupRepository.save(feeGroup);
  }
}
