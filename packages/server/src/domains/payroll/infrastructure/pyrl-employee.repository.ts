import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlEmployeeEntity } from "../domain/pyrl-employee.entity";

export interface ListPyrlEmployeesFilter {
  isActive?: boolean;
  departmentId?: string;
}

/** Raw-row shape returned by `searchByName()`'s hand-written SQL — snake_case, matching `app.pyrl_employee`'s columns 1:1. */
interface RawPyrlEmployeeSearchRow {
  id: string;
  staff_no: string;
  user_id: string | null;
  full_name: string;
  national_id: string;
  kra_pin: string;
  nssf_no: string | null;
  shif_no: string | null;
  employment_type: PyrlEmployeeEntity["employmentType"];
  department_id: string;
  job_title: string;
  hire_date: string;
  exit_date: string | null;
  pay_details: unknown | null;
  bank_name: unknown | null;
  branch: unknown | null;
  account: unknown | null;
  cost_center_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  version: number;
  relevance: number;
}

function mapRawSearchRow(row: RawPyrlEmployeeSearchRow): PyrlEmployeeEntity {
  return {
    id: row.id,
    staffNo: row.staff_no,
    userId: row.user_id,
    fullName: row.full_name,
    nationalId: row.national_id,
    kraPin: row.kra_pin,
    nssfNo: row.nssf_no,
    shifNo: row.shif_no,
    employmentType: row.employment_type,
    departmentId: row.department_id,
    jobTitle: row.job_title,
    hireDate: row.hire_date,
    exitDate: row.exit_date,
    payDetails: row.pay_details,
    bankName: row.bank_name,
    branch: row.branch,
    account: row.account,
    costCenterId: row.cost_center_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    version: row.version,
  } as PyrlEmployeeEntity;
}

/**
 * Plain repository wrapper for `pyrl_employee`, plus `searchByName()` — a
 * real trigram search against `ix_pyrl_employee_full_name_trgm` (migration
 * `0130`), the same `pg_trgm` `%` similarity pattern
 * `ProcSupplierRepository.searchByName()`/`StdStudentRepository.
 * searchByNameOrAdmissionNo()` established.
 */
@Injectable()
export class PyrlEmployeeRepository {
  constructor(
    @InjectRepository(PyrlEmployeeEntity)
    private readonly repo: Repository<PyrlEmployeeEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlEmployeeEntity | null> {
    return (manager?.getRepository(PyrlEmployeeEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlEmployeeEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlEmployee", id);
    return row;
  }

  async findByStaffNo(staffNo: string, manager?: EntityManager): Promise<PyrlEmployeeEntity | null> {
    return (manager?.getRepository(PyrlEmployeeEntity) ?? this.repo).findOne({ where: { staffNo } });
  }

  async list(filter: ListPyrlEmployeesFilter = {}, manager?: EntityManager): Promise<PyrlEmployeeEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    if (filter.departmentId !== undefined) where.departmentId = filter.departmentId;
    return (manager?.getRepository(PyrlEmployeeEntity) ?? this.repo).find({ where, order: { fullName: "ASC" } });
  }

  async create(data: Partial<PyrlEmployeeEntity>, manager?: EntityManager): Promise<PyrlEmployeeEntity> {
    const repo = manager?.getRepository(PyrlEmployeeEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlEmployeeEntity, manager?: EntityManager): Promise<PyrlEmployeeEntity> {
    return (manager?.getRepository(PyrlEmployeeEntity) ?? this.repo).save(entity);
  }

  /**
   * Trigram similarity search against `full_name`
   * (`ix_pyrl_employee_full_name_trgm`). Returns at most `limit` rows,
   * most-relevant first.
   */
  async searchByName(query: string, limit = 20, manager?: EntityManager): Promise<PyrlEmployeeEntity[]> {
    const source = manager ?? this.repo.manager;
    const normalized = query.trim().toLowerCase();
    const rows: RawPyrlEmployeeSearchRow[] = await source.query(
      `
      SELECT e.*, similarity(e.full_name, $1) AS relevance
      FROM app.pyrl_employee e
      WHERE e.full_name % $1
      ORDER BY relevance DESC, e.full_name ASC
      LIMIT $2
      `,
      [normalized, limit],
    );
    return rows.map(mapRawSearchRow);
  }
}
