import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { InvCategoryEntity } from "../domain/inv-category.entity";
import { InvCategoryRepository } from "../infrastructure/inv-category.repository";

export interface CreateCategoryInput {
  name: string;
  parentId?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
}

/** CRUD for `inv_category` — a hierarchical (self-referencing `parent_id`) item category tree. */
@Injectable()
export class CategoriesService {
  constructor(private readonly categoryRepository: InvCategoryRepository) {}

  async create(input: CreateCategoryInput, actorId: string | null): Promise<InvCategoryEntity> {
    if (input.parentId) {
      await this.categoryRepository.findByIdOrFail(input.parentId);
    }
    return this.categoryRepository.create({
      name: input.name,
      parentId: input.parentId ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async update(id: string, changes: UpdateCategoryInput, actorId: string | null): Promise<InvCategoryEntity> {
    const category = await this.categoryRepository.findByIdOrFail(id);
    if (changes.parentId !== undefined) {
      if (changes.parentId === id) {
        throw new ValidationException(`Category ${id} cannot be its own parent`);
      }
      if (changes.parentId) {
        await this.categoryRepository.findByIdOrFail(changes.parentId);
      }
      category.parentId = changes.parentId;
    }
    if (changes.name !== undefined) category.name = changes.name;
    category.updatedBy = actorId;
    return this.categoryRepository.save(category);
  }

  async findByIdOrFail(id: string): Promise<InvCategoryEntity> {
    return this.categoryRepository.findByIdOrFail(id);
  }

  async listByParent(parentId: string | null): Promise<InvCategoryEntity[]> {
    return this.categoryRepository.listByParent(parentId);
  }

  async listAll(): Promise<InvCategoryEntity[]> {
    return this.categoryRepository.listAll();
  }
}
