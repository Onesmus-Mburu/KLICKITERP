import { Injectable } from "@nestjs/common";
import { InvStoreEntity } from "../domain/inv-store.entity";
import { InvStoreRepository, ListInvStoresFilter } from "../infrastructure/inv-store.repository";

export interface CreateStoreInput {
  name: string;
  location: string;
  keeperUserId: string;
}

export interface UpdateStoreInput {
  name?: string;
  location?: string;
  keeperUserId?: string;
  isActive?: boolean;
}

/** CRUD for `inv_store` — a physical/logical stock location (warehouse, shop counter, department store). */
@Injectable()
export class StoresService {
  constructor(private readonly storeRepository: InvStoreRepository) {}

  async create(input: CreateStoreInput, actorId: string | null): Promise<InvStoreEntity> {
    return this.storeRepository.create({
      name: input.name,
      location: input.location,
      keeperUserId: input.keeperUserId,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async update(id: string, changes: UpdateStoreInput, actorId: string | null): Promise<InvStoreEntity> {
    const store = await this.storeRepository.findByIdOrFail(id);
    if (changes.name !== undefined) store.name = changes.name;
    if (changes.location !== undefined) store.location = changes.location;
    if (changes.keeperUserId !== undefined) store.keeperUserId = changes.keeperUserId;
    if (changes.isActive !== undefined) store.isActive = changes.isActive;
    store.updatedBy = actorId;
    return this.storeRepository.save(store);
  }

  async findByIdOrFail(id: string): Promise<InvStoreEntity> {
    return this.storeRepository.findByIdOrFail(id);
  }

  async list(filter: ListInvStoresFilter = {}): Promise<InvStoreEntity[]> {
    return this.storeRepository.list(filter);
  }
}
