import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { GlIntegrityRunEntity } from "../domain/gl-integrity-run.entity";

@Injectable()
export class GlIntegrityRunRepository {
  constructor(
    @InjectRepository(GlIntegrityRunEntity)
    private readonly repo: Repository<GlIntegrityRunEntity>,
  ) {}

  async listRecent(limit = 50, manager?: EntityManager): Promise<GlIntegrityRunEntity[]> {
    return (manager?.getRepository(GlIntegrityRunEntity) ?? this.repo).find({
      order: { ranAt: "DESC" },
      take: limit,
    });
  }

  async findLatest(kind: string, manager?: EntityManager): Promise<GlIntegrityRunEntity | null> {
    return (manager?.getRepository(GlIntegrityRunEntity) ?? this.repo).findOne({
      where: { kind },
      order: { ranAt: "DESC" },
    });
  }

  async create(data: Partial<GlIntegrityRunEntity>, manager?: EntityManager): Promise<GlIntegrityRunEntity> {
    const repo = manager?.getRepository(GlIntegrityRunEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }
}
