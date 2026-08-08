import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { StdClassEntity } from "../domain/std-class.entity";
import { StdClassRepository } from "../infrastructure/std-class.repository";
import { StdStreamRepository } from "../infrastructure/std-stream.repository";
import { StdStudentRepository } from "../infrastructure/std-student.repository";

export interface CreateStdClassInput {
  name: string;
  level: number;
}

export interface UpdateStdClassInput {
  name?: string;
  level?: number;
  isActive?: boolean;
}

/** CRUD for `std_class` — the class ladder (e.g. "Grade 1"). */
@Injectable()
export class ClassesService {
  constructor(
    private readonly classRepository: StdClassRepository,
    private readonly streamRepository: StdStreamRepository,
    private readonly studentRepository: StdStudentRepository,
  ) {}

  async create(input: CreateStdClassInput, actorId: string | null): Promise<StdClassEntity> {
    if (await this.classRepository.findByName(input.name)) {
      throw new ConflictException(`std_class name already in use: ${input.name}`);
    }
    return this.classRepository.create({
      name: input.name,
      level: input.level,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<StdClassEntity> {
    return this.classRepository.findByIdOrFail(id);
  }

  async list(): Promise<StdClassEntity[]> {
    return this.classRepository.list();
  }

  async update(id: string, changes: UpdateStdClassInput, actorId: string | null): Promise<StdClassEntity> {
    const klass = await this.classRepository.findByIdOrFail(id);
    if (changes.name !== undefined) klass.name = changes.name;
    if (changes.level !== undefined) klass.level = changes.level;
    if (changes.isActive !== undefined) klass.isActive = changes.isActive;
    klass.updatedBy = actorId;
    return this.classRepository.save(klass);
  }

  /**
   * Hard DELETE (Phase 6 Slice 2b — Class/Stream delete). No delete
   * endpoint existed for `std_class` prior to this — a deliberate,
   * documented exclusion when the Classes & Streams management page was
   * first built. `std_student.class_id`, `std_stream.class_id`, AND
   * `bill_fee_structure.class_id` (`domains/billing` — a real gap found
   * during this pass's own live verification, see
   * `StdClassRepository.countFeeStructureReferences()`'s doc comment) are
   * all real `onDelete: "RESTRICT"` FKs, so a naive DELETE would already be
   * rejected at the DB level for a referenced class — but a raw Postgres
   * FK-violation error is not a client-facing message worth showing a
   * user. Pre-checking all three counts and throwing a specific
   * `ConflictException` (mirroring `ChartOfAccountsService.remove()`'s
   * referencing-error translation pattern, just via a pre-check instead of
   * a catch, since multiple distinct referencing relations need to be
   * named together in one message) gives a genuinely informative error
   * instead of a raw constraint-violation string, while the DB constraints
   * themselves remain the real, final safety net if this check is ever
   * bypassed (e.g. a future direct-SQL path).
   */
  async delete(id: string, actorId: string | null): Promise<void> {
    await this.classRepository.findByIdOrFail(id);
    const [studentCount, streamCount, feeStructureCount] = await Promise.all([
      this.studentRepository.countByClassId(id),
      this.streamRepository.countByClassId(id),
      this.classRepository.countFeeStructureReferences(id),
    ]);
    if (studentCount > 0 || streamCount > 0 || feeStructureCount > 0) {
      const parts: string[] = [];
      if (studentCount > 0) parts.push(`${studentCount} student(s)`);
      if (streamCount > 0) parts.push(`${streamCount} stream(s)`);
      if (feeStructureCount > 0) parts.push(`${feeStructureCount} fee structure(s)`);
      throw new ConflictException(`Cannot delete class: ${parts.join(" and ")} still reference it`);
    }
    void actorId; // accepted for signature parity with create()/update() and future audit-trail use; a deleted row has no updatedBy to stamp.
    await this.classRepository.delete(id);
  }
}
