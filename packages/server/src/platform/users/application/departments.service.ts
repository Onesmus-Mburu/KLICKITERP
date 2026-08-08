import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { UsrDepartmentEntity } from "../domain/usr-department.entity";
import { UsrUserEntity } from "../domain/usr-user.entity";
import { UsrDepartmentRepository } from "../infrastructure/usr-department.repository";

@Injectable()
export class DepartmentsService {
  constructor(private readonly departmentRepository: UsrDepartmentRepository) {}

  async create(data: { name: string; headUserId?: string | null }): Promise<UsrDepartmentEntity> {
    const list = await this.departmentRepository.list();
    if (list.some((d) => d.name === data.name)) {
      throw new ConflictException(`Department name already in use: ${data.name}`);
    }
    return this.departmentRepository.create({ name: data.name, headUserId: data.headUserId ?? null });
  }

  async list(): Promise<UsrDepartmentEntity[]> {
    return this.departmentRepository.list();
  }

  async findByIdOrFail(id: string): Promise<UsrDepartmentEntity> {
    const dept = await this.departmentRepository.findById(id);
    if (!dept) throw new NotFoundException("Department", id);
    return dept;
  }

  async update(id: string, changes: { name?: string; headUserId?: string | null }): Promise<UsrDepartmentEntity> {
    const dept = await this.findByIdOrFail(id);
    if (changes.name !== undefined) dept.name = changes.name;
    if (changes.headUserId !== undefined) {
      dept.headUserId = changes.headUserId;
      // `findByIdOrFail` (via `findById`) eager-loads the `headUser` relation
      // (Phase 6 Slice 13 Part 1). `UsrDepartmentEntity` has both a scalar
      // `headUserId` column and a `@ManyToOne`/`@JoinColumn headUser` on the
      // SAME `head_user_id` column — TypeORM's `save()` derives the FK from
      // a loaded relation object when one is present, silently overriding a
      // direct scalar mutation. Keeping `headUser` in sync with the scalar
      // here (rather than leaving the stale pre-update object attached) is
      // what makes the scalar change actually persist — confirmed as the
      // real, reproducible root cause of a silent "clear/switch head fails,
      // response reports success anyway" defect before this fix.
      dept.headUser = changes.headUserId === null ? null : ({ id: changes.headUserId } as UsrUserEntity);
    }
    return this.departmentRepository.save(dept);
  }
}
