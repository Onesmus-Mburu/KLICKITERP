import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlLoanEntity, PyrlLoanStatus } from "../domain/pyrl-loan.entity";

export interface ListPyrlLoansFilter {
  employeeId?: string;
  status?: PyrlLoanStatus;
}

/** Plain repository wrapper for `pyrl_loan`. */
@Injectable()
export class PyrlLoanRepository {
  constructor(
    @InjectRepository(PyrlLoanEntity)
    private readonly repo: Repository<PyrlLoanEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlLoanEntity | null> {
    return (manager?.getRepository(PyrlLoanEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlLoanEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlLoan", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<PyrlLoanEntity | null> {
    return (manager?.getRepository(PyrlLoanEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(filter: ListPyrlLoansFilter = {}, manager?: EntityManager): Promise<PyrlLoanEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.employeeId !== undefined) where.employeeId = filter.employeeId;
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(PyrlLoanEntity) ?? this.repo).find({ where, order: { createdAt: "DESC" } });
  }

  /** Loans with an outstanding balance to recover this run — the next pass's recovery-engine entry point. */
  async findActiveForEmployee(employeeId: string, manager?: EntityManager): Promise<PyrlLoanEntity[]> {
    return (manager?.getRepository(PyrlLoanEntity) ?? this.repo).find({
      where: { employeeId, status: "ACTIVE" },
      order: { createdAt: "ASC" },
    });
  }

  async create(data: Partial<PyrlLoanEntity>, manager?: EntityManager): Promise<PyrlLoanEntity> {
    const repo = manager?.getRepository(PyrlLoanEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlLoanEntity, manager?: EntityManager): Promise<PyrlLoanEntity> {
    return (manager?.getRepository(PyrlLoanEntity) ?? this.repo).save(entity);
  }
}
