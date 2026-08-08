import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrRoleEntity } from "../domain/usr-role.entity";

@Injectable()
export class UsrRoleRepository {
  constructor(
    @InjectRepository(UsrRoleEntity)
    private readonly repo: Repository<UsrRoleEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<UsrRoleEntity | null> {
    return (manager?.getRepository(UsrRoleEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByName(name: string): Promise<UsrRoleEntity | null> {
    return this.repo.findOne({ where: { name } });
  }

  async list(): Promise<UsrRoleEntity[]> {
    return this.repo.find({ order: { name: "ASC" } });
  }

  async create(data: Partial<UsrRoleEntity>, manager?: EntityManager): Promise<UsrRoleEntity> {
    const repo = manager?.getRepository(UsrRoleEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: UsrRoleEntity, manager?: EntityManager): Promise<UsrRoleEntity> {
    return (manager?.getRepository(UsrRoleEntity) ?? this.repo).save(entity);
  }
}
