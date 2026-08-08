import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrPermissionEntity } from "../domain/usr-permission.entity";

@Injectable()
export class UsrPermissionRepository {
  constructor(
    @InjectRepository(UsrPermissionEntity)
    private readonly repo: Repository<UsrPermissionEntity>,
  ) {}

  async findByCode(code: string, manager?: EntityManager): Promise<UsrPermissionEntity | null> {
    return (manager?.getRepository(UsrPermissionEntity) ?? this.repo).findOne({ where: { code } });
  }

  async findByCodes(codes: readonly string[]): Promise<UsrPermissionEntity[]> {
    if (codes.length === 0) return [];
    return this.repo
      .createQueryBuilder("p")
      .where("p.code IN (:...codes)", { codes: [...codes] })
      .getMany();
  }

  /** Phase 6 Slice 13 Part 1 — `PermissionsService.list(module)`'s `?module=` filter, mirroring `list()`'s own ordering. */
  async findByModule(module: string): Promise<UsrPermissionEntity[]> {
    return this.repo.find({ where: { module }, order: { code: "ASC" } });
  }

  async list(): Promise<UsrPermissionEntity[]> {
    return this.repo.find({ order: { module: "ASC", code: "ASC" } });
  }

  async upsert(data: { code: string; module: string; description: string; isWrite: boolean }): Promise<UsrPermissionEntity> {
    const existing = await this.findByCode(data.code);
    if (existing) {
      existing.module = data.module;
      existing.description = data.description;
      existing.isWrite = data.isWrite;
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create(data));
  }
}
