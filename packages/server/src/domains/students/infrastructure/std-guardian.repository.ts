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

  /**
   * The Parents directory's own "Students" column — one bulk, GROUP-BY query
   * for every guardian on the page in a single round trip, not N+1 (mirrors
   * `StdClassRepository.countFeeStructureReferences()`'s own raw-SQL-via-
   * `source.query()` precedent for the identical reason: no `.groupBy()`
   * query-builder usage exists anywhere else in this codebase to follow
   * instead). Guardians with zero links are simply absent from the result
   * rows (an aggregate `GROUP BY` never emits a zero-count row) — callers
   * must default to `0` for any id missing from the returned map, same as
   * `countFeeStructureReferences()`'s own `rows[0]?.count ?? 0` fallback.
   */
  async countLinkedStudentsForGuardians(guardianIds: string[], manager?: EntityManager): Promise<Map<string, number>> {
    if (guardianIds.length === 0) return new Map();
    const source = manager ?? this.repo.manager;
    const rows: Array<{ guardian_id: string; count: string }> = await source.query(
      `SELECT guardian_id, COUNT(*)::int AS count FROM app.std_student_guardian WHERE guardian_id = ANY($1::uuid[]) GROUP BY guardian_id`,
      [guardianIds],
    );
    return new Map(rows.map((r) => [r.guardian_id, Number(r.count)]));
  }

  async create(data: Partial<StdGuardianEntity>, manager?: EntityManager): Promise<StdGuardianEntity> {
    const repo = manager?.getRepository(StdGuardianEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: StdGuardianEntity, manager?: EntityManager): Promise<StdGuardianEntity> {
    return (manager?.getRepository(StdGuardianEntity) ?? this.repo).save(entity);
  }
}
