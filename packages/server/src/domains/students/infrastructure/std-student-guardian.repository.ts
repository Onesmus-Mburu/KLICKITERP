import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { StdStudentGuardianEntity } from "../domain/std-student-guardian.entity";

@Injectable()
export class StdStudentGuardianRepository {
  constructor(
    @InjectRepository(StdStudentGuardianEntity)
    private readonly repo: Repository<StdStudentGuardianEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<StdStudentGuardianEntity | null> {
    return (manager?.getRepository(StdStudentGuardianEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<StdStudentGuardianEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("StdStudentGuardian", id);
    return row;
  }

  async findByStudentAndGuardian(
    studentId: string,
    guardianId: string,
    manager?: EntityManager,
  ): Promise<StdStudentGuardianEntity | null> {
    return (manager?.getRepository(StdStudentGuardianEntity) ?? this.repo).findOne({
      where: { studentId, guardianId },
    });
  }

  async findPrimaryForStudent(studentId: string, manager?: EntityManager): Promise<StdStudentGuardianEntity | null> {
    return (manager?.getRepository(StdStudentGuardianEntity) ?? this.repo).findOne({
      where: { studentId, isPrimary: true },
    });
  }

  async listByStudent(studentId: string, manager?: EntityManager): Promise<StdStudentGuardianEntity[]> {
    return (manager?.getRepository(StdStudentGuardianEntity) ?? this.repo).find({ where: { studentId } });
  }

  async listByGuardian(guardianId: string, manager?: EntityManager): Promise<StdStudentGuardianEntity[]> {
    return (manager?.getRepository(StdStudentGuardianEntity) ?? this.repo).find({ where: { guardianId } });
  }

  async create(data: Partial<StdStudentGuardianEntity>, manager?: EntityManager): Promise<StdStudentGuardianEntity> {
    const repo = manager?.getRepository(StdStudentGuardianEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: StdStudentGuardianEntity, manager?: EntityManager): Promise<StdStudentGuardianEntity> {
    return (manager?.getRepository(StdStudentGuardianEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(StdStudentGuardianEntity) ?? this.repo).delete(id);
  }

  /**
   * Phase 6 Slice 2b — Student delete: bulk-removes every `std_student_guardian`
   * LINK row for a student being deleted. Deliberately NOT blocked on — a
   * link row is purely administrative metadata (which guardians are
   * associated with this student), not an independent financial/historical
   * record, so `StudentsService.delete()` auto-cleans these up in the same
   * transaction rather than requiring the caller to unlink guardians first.
   * This does NOT touch `std_guardian` itself — a guardian (with or without
   * other children still linked) is always left fully intact; no
   * guardian-delete endpoint exists or is being added here.
   */
  async deleteByStudentId(studentId: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(StdStudentGuardianEntity) ?? this.repo).delete({ studentId });
  }
}
