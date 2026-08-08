import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlRunLineEntity } from "../domain/pyrl-run-line.entity";

/** Plain repository wrapper for `pyrl_run_line`, plus `findByRunId()`. */
@Injectable()
export class PyrlRunLineRepository {
  constructor(
    @InjectRepository(PyrlRunLineEntity)
    private readonly repo: Repository<PyrlRunLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlRunLineEntity | null> {
    return (manager?.getRepository(PyrlRunLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlRunLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlRunLine", id);
    return row;
  }

  /** All payslip lines of a run — payslip generation/output-file entry point. */
  async findByRunId(runId: string, manager?: EntityManager): Promise<PyrlRunLineEntity[]> {
    return (manager?.getRepository(PyrlRunLineEntity) ?? this.repo).find({ where: { runId } });
  }

  async findByRunAndEmployee(
    runId: string,
    employeeId: string,
    manager?: EntityManager,
  ): Promise<PyrlRunLineEntity | null> {
    return (manager?.getRepository(PyrlRunLineEntity) ?? this.repo).findOne({ where: { runId, employeeId } });
  }

  async create(data: Partial<PyrlRunLineEntity>, manager?: EntityManager): Promise<PyrlRunLineEntity> {
    const repo = manager?.getRepository(PyrlRunLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlRunLineEntity, manager?: EntityManager): Promise<PyrlRunLineEntity> {
    return (manager?.getRepository(PyrlRunLineEntity) ?? this.repo).save(entity);
  }

  /**
   * PASS B — wholesale delete of every line belonging to a run, the
   * recompute mechanism `PyrlRunLineComponentEntity`'s own doc comment
   * anticipates ("deleting/recreating a DRAFT/COMPUTED run's lines
   * wholesale... is the next pass's recompute mechanism"). `ON DELETE
   * CASCADE` from `pyrl_run_line` to `pyrl_run_line_component` (migration
   * `0130`) means this single statement also removes every breakdown row —
   * no separate `PyrlRunLineComponentRepository` cleanup call is needed.
   * Callers (`PayrollRunsService.compute()`) are responsible for only
   * invoking this while the parent run is still pre-`COMMITTED`
   * (`trg_pyrl_run_line_immutable` would reject the deletes' implied writes
   * otherwise, though a `DELETE` isn't actually an `UPDATE` the trigger
   * fires on — recomputing a committed run is still a service-layer status
   * guard, not solely a DB-trigger one).
   */
  async deleteByRunId(runId: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(PyrlRunLineEntity) ?? this.repo).delete({ runId });
  }
}
