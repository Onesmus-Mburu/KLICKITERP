import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { StdClassEntity } from "../domain/std-class.entity";

@Injectable()
export class StdClassRepository {
  constructor(
    @InjectRepository(StdClassEntity)
    private readonly repo: Repository<StdClassEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<StdClassEntity | null> {
    return (manager?.getRepository(StdClassEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<StdClassEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("StdClass", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<StdClassEntity | null> {
    return (manager?.getRepository(StdClassEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<StdClassEntity[]> {
    return (manager?.getRepository(StdClassEntity) ?? this.repo).find({ order: { level: "ASC" } });
  }

  async create(data: Partial<StdClassEntity>, manager?: EntityManager): Promise<StdClassEntity> {
    const repo = manager?.getRepository(StdClassEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: StdClassEntity, manager?: EntityManager): Promise<StdClassEntity> {
    return (manager?.getRepository(StdClassEntity) ?? this.repo).save(entity);
  }

  /** Hard DELETE — `ClassesService.delete()`'s only caller, called only after that service has confirmed no `std_student`/`std_stream`/`bill_fee_structure` row references this class. */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(StdClassEntity) ?? this.repo).delete(id);
  }

  /**
   * Cross-domain reference check ahead of delete — `bill_fee_structure.class_id`
   * is a real `onDelete: "RESTRICT"` FK owned by `domains/billing`
   * (migration `0070`, mirrored in `bill-fee-structure.entity.ts`'s own
   * `@ManyToOne(() => StdClassEntity, { onDelete: "RESTRICT" })`). Found via
   * REAL live verification (Phase 6 Slice 2b — Class/Stream delete): the
   * first live DELETE against a class referenced only by a fee structure
   * surfaced as a raw Postgres FK-violation 500 (`update or delete on table
   * "std_class" violates foreign key constraint "fk_bill_fee_structure_class_id"`),
   * not a clean 409 — this repository's pre-existing pre-checks only knew
   * about `std_student`/`std_stream`. Raw SQL against `app.bill_fee_structure`
   * directly, NOT a `domains/billing` repository/module import:
   * `billing.module.ts` already imports `StudentsModule` (confirmed by
   * reading that file), so the reverse TS-level import here would be a
   * genuine circular NestJS module dependency; a raw query sidesteps that
   * entirely, the same mechanism `GlAccountRepository.hasPostings()` already
   * uses for an analogous before-delete external-reference check.
   */
  async countFeeStructureReferences(classId: string, manager?: EntityManager): Promise<number> {
    const source = manager ?? this.repo.manager;
    const rows: Array<{ count: string }> = await source.query(
      `SELECT COUNT(*)::int AS count FROM app.bill_fee_structure WHERE class_id = $1`,
      [classId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
