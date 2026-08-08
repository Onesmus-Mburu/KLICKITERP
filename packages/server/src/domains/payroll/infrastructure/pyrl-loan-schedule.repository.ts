import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlLoanScheduleEntity } from "../domain/pyrl-loan-schedule.entity";

/** Plain repository wrapper for `pyrl_loan_schedule`, plus `findByLoanId()`. */
@Injectable()
export class PyrlLoanScheduleRepository {
  constructor(
    @InjectRepository(PyrlLoanScheduleEntity)
    private readonly repo: Repository<PyrlLoanScheduleEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlLoanScheduleEntity | null> {
    return (manager?.getRepository(PyrlLoanScheduleEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlLoanScheduleEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlLoanSchedule", id);
    return row;
  }

  /** All installments of a loan, ordered by `seq` — amortization-schedule/statement entry point. */
  async findByLoanId(loanId: string, manager?: EntityManager): Promise<PyrlLoanScheduleEntity[]> {
    return (manager?.getRepository(PyrlLoanScheduleEntity) ?? this.repo).find({
      where: { loanId },
      order: { seq: "ASC" },
    });
  }

  async create(
    data: Partial<PyrlLoanScheduleEntity>,
    manager?: EntityManager,
  ): Promise<PyrlLoanScheduleEntity> {
    const repo = manager?.getRepository(PyrlLoanScheduleEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlLoanScheduleEntity, manager?: EntityManager): Promise<PyrlLoanScheduleEntity> {
    return (manager?.getRepository(PyrlLoanScheduleEntity) ?? this.repo).save(entity);
  }
}
