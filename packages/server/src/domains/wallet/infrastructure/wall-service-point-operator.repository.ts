import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { WallServicePointOperatorEntity } from "../domain/wall-service-point-operator.entity";

@Injectable()
export class WallServicePointOperatorRepository {
  constructor(
    @InjectRepository(WallServicePointOperatorEntity)
    private readonly repo: Repository<WallServicePointOperatorEntity>,
  ) {}

  async findOne(servicePointId: string, userId: string, manager?: EntityManager): Promise<WallServicePointOperatorEntity | null> {
    return (manager?.getRepository(WallServicePointOperatorEntity) ?? this.repo).findOne({
      where: { servicePointId, userId },
    });
  }

  async listByServicePoint(servicePointId: string, manager?: EntityManager): Promise<WallServicePointOperatorEntity[]> {
    return (manager?.getRepository(WallServicePointOperatorEntity) ?? this.repo).find({ where: { servicePointId } });
  }

  async create(data: Partial<WallServicePointOperatorEntity>, manager?: EntityManager): Promise<WallServicePointOperatorEntity> {
    const repo = manager?.getRepository(WallServicePointOperatorEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async remove(entity: WallServicePointOperatorEntity, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(WallServicePointOperatorEntity) ?? this.repo).remove(entity);
  }
}
