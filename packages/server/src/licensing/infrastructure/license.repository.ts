import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { LicenseEntity } from "../domain/license.entity";

/**
 * `license.license` is a singular, per-instance table in practice (this is
 * a single-school deployment, not a multi-tenant row set) — `findCurrent()`
 * reads the most-recently-created row, mirroring `license.v_state`'s own
 * `ORDER BY created_at DESC LIMIT 1` convention at the DB level (migration
 * `0190`).
 */
@Injectable()
export class LicenseRepository {
  constructor(
    @InjectRepository(LicenseEntity)
    private readonly repo: Repository<LicenseEntity>,
  ) {}

  async findCurrent(manager?: EntityManager): Promise<LicenseEntity | null> {
    const repo = manager?.getRepository(LicenseEntity) ?? this.repo;
    return repo.findOne({ where: {}, order: { createdAt: "DESC" } });
  }

  async findCurrentOrFail(manager?: EntityManager): Promise<LicenseEntity> {
    const row = await this.findCurrent(manager);
    if (!row) {
      throw new NotFoundException("License", "current");
    }
    return row;
  }

  async create(data: Partial<LicenseEntity>, manager?: EntityManager): Promise<LicenseEntity> {
    const repo = manager?.getRepository(LicenseEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: LicenseEntity, manager?: EntityManager): Promise<LicenseEntity> {
    return (manager?.getRepository(LicenseEntity) ?? this.repo).save(entity);
  }
}
