import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SetIntegrationConfigEntity, SetIntegrationKind } from "../domain/set-integration-config.entity";

@Injectable()
export class SetIntegrationConfigRepository {
  constructor(
    @InjectRepository(SetIntegrationConfigEntity)
    private readonly repo: Repository<SetIntegrationConfigEntity>,
  ) {}

  async findById(id: string): Promise<SetIntegrationConfigEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByKindAndName(kind: SetIntegrationKind, name: string): Promise<SetIntegrationConfigEntity | null> {
    return this.repo.findOne({ where: { kind, name } });
  }

  async list(): Promise<SetIntegrationConfigEntity[]> {
    return this.repo.find({ order: { kind: "ASC", priority: "ASC" } });
  }

  async create(data: Partial<SetIntegrationConfigEntity>): Promise<SetIntegrationConfigEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async save(entity: SetIntegrationConfigEntity): Promise<SetIntegrationConfigEntity> {
    return this.repo.save(entity);
  }
}
