import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import {
  SetCustomFieldDefEntity,
  SetCustomFieldEntityType,
  SetCustomFieldType,
} from "../domain/set-custom-field-def.entity";
import { SetCustomFieldDefRepository } from "../infrastructure/set-custom-field-def.repository";

export interface CreateCustomFieldInput {
  entity: SetCustomFieldEntityType;
  key: string;
  label: string;
  fieldType: SetCustomFieldType;
  options?: unknown | null;
  isRequired?: boolean;
}

/**
 * CRUD for `set_custom_field_def` (FR-SET §4 schema). No hard-delete
 * endpoint: once a custom field is defined it may already have data
 * attached against STUDENT/SUPPLIER/EMPLOYEE/ASSET records in later
 * modules, mirroring `RolesService`/`DepartmentsService`'s pattern of no
 * delete for referenced definitional rows in Module 1.
 */
@Injectable()
export class CustomFieldService {
  constructor(private readonly customFieldRepository: SetCustomFieldDefRepository) {}

  async create(input: CreateCustomFieldInput, actorId: string | null): Promise<SetCustomFieldDefEntity> {
    if (await this.customFieldRepository.findByEntityAndKey(input.entity, input.key)) {
      throw new ConflictException(`Custom field already defined: ${input.entity}/${input.key}`);
    }
    return this.customFieldRepository.create({
      entity: input.entity,
      key: input.key,
      label: input.label,
      fieldType: input.fieldType,
      options: input.options ?? null,
      isRequired: input.isRequired ?? false,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(entity?: SetCustomFieldEntityType): Promise<SetCustomFieldDefEntity[]> {
    return this.customFieldRepository.list(entity);
  }

  async findByIdOrFail(id: string): Promise<SetCustomFieldDefEntity> {
    const row = await this.customFieldRepository.findById(id);
    if (!row) throw new NotFoundException("CustomFieldDef", id);
    return row;
  }

  async update(
    id: string,
    changes: { label?: string; options?: unknown | null; isRequired?: boolean },
    actorId: string | null,
  ): Promise<SetCustomFieldDefEntity> {
    const row = await this.findByIdOrFail(id);
    if (changes.label !== undefined) row.label = changes.label;
    if (changes.options !== undefined) row.options = changes.options;
    if (changes.isRequired !== undefined) row.isRequired = changes.isRequired;
    row.updatedBy = actorId;
    return this.customFieldRepository.save(row);
  }
}
