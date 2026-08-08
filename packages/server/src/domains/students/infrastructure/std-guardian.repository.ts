import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { StdGuardianEntity } from "../domain/std-guardian.entity";

@Injectable()
export class StdGuardianRepository {
  constructor(
    @InjectRepository(StdGuardianEntity)
    private readonly repo: Repository<StdGuardianEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<StdGuardianEntity | null> {
    return (manager?.getRepository(StdGuardianEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<StdGuardianEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("StdGuardian", id);
    return row;
  }

  async findByPhone(phone: string, manager?: EntityManager): Promise<StdGuardianEntity | null> {
    return (manager?.getRepository(StdGuardianEntity) ?? this.repo).findOne({ where: { phone } });
  }

  /**
   * Phase 6 Slice 2c — sibling guardian dedup. Mirrors `findByPhone()`
   * exactly — an exact-match lookup, no case-normalization (no precedent for
   * it anywhere in this codebase; `email` has no case-insensitive index).
   * `GuardiansService.create()` checks this ONLY when no phone match was
   * found, so it's the second (weaker — `email` has no DB uniqueness
   * constraint, per the plan's explicit scope note) leg of the
   * phone-then-email dedup lookup.
   */
  async findByEmail(email: string, manager?: EntityManager): Promise<StdGuardianEntity | null> {
    return (manager?.getRepository(StdGuardianEntity) ?? this.repo).findOne({ where: { email } });
  }

  async list(manager?: EntityManager): Promise<StdGuardianEntity[]> {
    return (manager?.getRepository(StdGuardianEntity) ?? this.repo).find({ order: { fullName: "ASC" } });
  }

  async create(data: Partial<StdGuardianEntity>, manager?: EntityManager): Promise<StdGuardianEntity> {
    const repo = manager?.getRepository(StdGuardianEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: StdGuardianEntity, manager?: EntityManager): Promise<StdGuardianEntity> {
    return (manager?.getRepository(StdGuardianEntity) ?? this.repo).save(entity);
  }
}
