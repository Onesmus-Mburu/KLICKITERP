import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlStatutoryTableEntity, PyrlStatutoryKind } from "../domain/pyrl-statutory-table.entity";

/**
 * Plain repository wrapper for `pyrl_statutory_table`, plus
 * `findEffectiveFor()` — BR-PYRL-01's exact lookup: "Statutory computations
 * always use the rate table effective on the payroll period's end date.
 * Missing table for a period blocks the run with a named error." The next
 * pass's computation engine is expected to treat a `null` return as that
 * named-error condition.
 */
@Injectable()
export class PyrlStatutoryTableRepository {
  constructor(
    @InjectRepository(PyrlStatutoryTableEntity)
    private readonly repo: Repository<PyrlStatutoryTableEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlStatutoryTableEntity | null> {
    return (manager?.getRepository(PyrlStatutoryTableEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlStatutoryTableEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlStatutoryTable", id);
    return row;
  }

  async listByKind(kind: PyrlStatutoryKind, manager?: EntityManager): Promise<PyrlStatutoryTableEntity[]> {
    return (manager?.getRepository(PyrlStatutoryTableEntity) ?? this.repo).find({
      where: { kind },
      order: { effectiveFrom: "DESC" },
    });
  }

  /**
   * BR-PYRL-01: the rate table row of `kind` whose `effective_from` is the
   * latest one `<= periodEndDate`. `null` when no such row exists (the
   * run-blocking condition).
   */
  async findEffectiveFor(
    kind: PyrlStatutoryKind,
    periodEndDate: string,
    manager?: EntityManager,
  ): Promise<PyrlStatutoryTableEntity | null> {
    return (manager?.getRepository(PyrlStatutoryTableEntity) ?? this.repo)
      .createQueryBuilder("t")
      .where("t.kind = :kind", { kind })
      .andWhere("t.effectiveFrom <= :periodEndDate", { periodEndDate })
      .orderBy("t.effectiveFrom", "DESC")
      .limit(1)
      .getOne();
  }

  async create(
    data: Partial<PyrlStatutoryTableEntity>,
    manager?: EntityManager,
  ): Promise<PyrlStatutoryTableEntity> {
    const repo = manager?.getRepository(PyrlStatutoryTableEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlStatutoryTableEntity, manager?: EntityManager): Promise<PyrlStatutoryTableEntity> {
    return (manager?.getRepository(PyrlStatutoryTableEntity) ?? this.repo).save(entity);
  }
}
