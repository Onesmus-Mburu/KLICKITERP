import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BrndThemeEntity } from "../domain/brnd-theme.entity";

@Injectable()
export class BrndThemeRepository {
  constructor(
    @InjectRepository(BrndThemeEntity)
    private readonly repo: Repository<BrndThemeEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BrndThemeEntity | null> {
    return (manager?.getRepository(BrndThemeEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BrndThemeEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BrndTheme", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<BrndThemeEntity | null> {
    return (manager?.getRepository(BrndThemeEntity) ?? this.repo).findOne({ where: { name } });
  }

  /** The at-most-one row with `status = 'PUBLISHED'` (`uq_brnd_theme_published_p`), or null if none is published yet. */
  async findPublished(manager?: EntityManager): Promise<BrndThemeEntity | null> {
    return (manager?.getRepository(BrndThemeEntity) ?? this.repo).findOne({ where: { status: "PUBLISHED" } });
  }

  async list(manager?: EntityManager): Promise<BrndThemeEntity[]> {
    return (manager?.getRepository(BrndThemeEntity) ?? this.repo).find({ order: { createdAt: "DESC" } });
  }

  async create(data: Partial<BrndThemeEntity>, manager?: EntityManager): Promise<BrndThemeEntity> {
    const repo = manager?.getRepository(BrndThemeEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BrndThemeEntity, manager?: EntityManager): Promise<BrndThemeEntity> {
    return (manager?.getRepository(BrndThemeEntity) ?? this.repo).save(entity);
  }
}
