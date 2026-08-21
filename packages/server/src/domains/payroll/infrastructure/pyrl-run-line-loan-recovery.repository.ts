import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlRunLineLoanRecoveryEntity } from "../domain/pyrl-run-line-loan-recovery.entity";

/** Plain repository wrapper for `pyrl_run_line_loan_recovery` — the per-loan breakdown behind a `pyrl_run_line`'s own aggregate `loan_recovered`/`deferred_recovery` scalars. */
@Injectable()
export class PyrlRunLineLoanRecoveryRepository {
  constructor(
    @InjectRepository(PyrlRunLineLoanRecoveryEntity)
    private readonly repo: Repository<PyrlRunLineLoanRecoveryEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlRunLineLoanRecoveryEntity | null> {
    return (manager?.getRepository(PyrlRunLineLoanRecoveryEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlRunLineLoanRecoveryEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlRunLineLoanRecovery", id);
    return row;
  }

  /** The full per-loan breakdown backing one `pyrl_run_line`'s aggregate `loan_recovered`/`deferred_recovery` — `commit()`'s own per-loan `recordRecovery()` iteration reads this, not the run-line's aggregate scalar. */
  async findByRunLineId(runLineId: string, manager?: EntityManager): Promise<PyrlRunLineLoanRecoveryEntity[]> {
    return (manager?.getRepository(PyrlRunLineLoanRecoveryEntity) ?? this.repo).find({ where: { runLineId } });
  }

  /** BR-PYRL-03's per-loan carryover lookup — the prior period's own row for this specific (run_line, loan), replacing the old single-scalar-per-employee `deferred_recovery` read. */
  async findByRunLineAndLoan(
    runLineId: string,
    loanId: string,
    manager?: EntityManager,
  ): Promise<PyrlRunLineLoanRecoveryEntity | null> {
    return (manager?.getRepository(PyrlRunLineLoanRecoveryEntity) ?? this.repo).findOne({ where: { runLineId, loanId } });
  }

  async create(
    data: Partial<PyrlRunLineLoanRecoveryEntity>,
    manager?: EntityManager,
  ): Promise<PyrlRunLineLoanRecoveryEntity> {
    const repo = manager?.getRepository(PyrlRunLineLoanRecoveryEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }
}
