import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { StdFeeGroupEntity } from "../domain/std-fee-group.entity";

@Injectable()
export class StdFeeGroupRepository {
  constructor(
    @InjectRepository(StdFeeGroupEntity)
    private readonly repo: Repository<StdFeeGroupEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<StdFeeGroupEntity | null> {
    return (manager?.getRepository(StdFeeGroupEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<StdFeeGroupEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("StdFeeGroup", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<StdFeeGroupEntity | null> {
    return (manager?.getRepository(StdFeeGroupEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<StdFeeGroupEntity[]> {
    return (manager?.getRepository(StdFeeGroupEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(data: Partial<StdFeeGroupEntity>, manager?: EntityManager): Promise<StdFeeGroupEntity> {
    const repo = manager?.getRepository(StdFeeGroupEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: StdFeeGroupEntity, manager?: EntityManager): Promise<StdFeeGroupEntity> {
    return (manager?.getRepository(StdFeeGroupEntity) ?? this.repo).save(entity);
  }
}
