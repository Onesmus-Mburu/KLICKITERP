import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { SetSettingEntity } from "../domain/set-setting.entity";

@Injectable()
export class SetSettingRepository {
  constructor(
    @InjectRepository(SetSettingEntity)
    private readonly repo: Repository<SetSettingEntity>,
  ) {}

  async findByKey(key: string, manager?: EntityManager): Promise<SetSettingEntity | null> {
    return (manager?.getRepository(SetSettingEntity) ?? this.repo).findOne({ where: { key } });
  }

  async list(manager?: EntityManager): Promise<SetSettingEntity[]> {
    return (manager?.getRepository(SetSettingEntity) ?? this.repo).find({ order: { key: "ASC" } });
  }

  async create(data: Partial<SetSettingEntity>, manager?: EntityManager): Promise<SetSettingEntity> {
    const repo = manager?.getRepository(SetSettingEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: SetSettingEntity, manager?: EntityManager): Promise<SetSettingEntity> {
    return (manager?.getRepository(SetSettingEntity) ?? this.repo).save(entity);
  }
}
