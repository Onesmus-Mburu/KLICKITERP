import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SetCustomFieldDefEntity, SetCustomFieldEntityType } from "../domain/set-custom-field-def.entity";

@Injectable()
export class SetCustomFieldDefRepository {
  constructor(
    @InjectRepository(SetCustomFieldDefEntity)
    private readonly repo: Repository<SetCustomFieldDefEntity>,
  ) {}

  async findById(id: string): Promise<SetCustomFieldDefEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEntityAndKey(entity: SetCustomFieldEntityType, key: string): Promise<SetCustomFieldDefEntity | null> {
    return this.repo.findOne({ where: { entity, key } });
  }

  async list(entity?: SetCustomFieldEntityType): Promise<SetCustomFieldDefEntity[]> {
    return this.repo.find({ where: entity ? { entity } : {}, order: { entity: "ASC", key: "ASC" } });
  }

  async create(data: Partial<SetCustomFieldDefEntity>): Promise<SetCustomFieldDefEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async save(entity: SetCustomFieldDefEntity): Promise<SetCustomFieldDefEntity> {
    return this.repo.save(entity);
  }
}
