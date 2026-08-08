import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { StdStreamEntity } from "../domain/std-stream.entity";
import { StdClassRepository } from "../infrastructure/std-class.repository";
import { StdStreamRepository } from "../infrastructure/std-stream.repository";
import { StdStudentRepository } from "../infrastructure/std-student.repository";

export interface CreateStdStreamInput {
  classId: string;
  name: string;
}

export interface UpdateStdStreamInput {
  name?: string;
}

/** CRUD for `std_stream`, scoped to its parent `std_class`. */
@Injectable()
export class StreamsService {
  constructor(
    private readonly streamRepository: StdStreamRepository,
    private readonly classRepository: StdClassRepository,
    private readonly studentRepository: StdStudentRepository,
  ) {}

  async create(input: CreateStdStreamInput, actorId: string | null): Promise<StdStreamEntity> {
    await this.classRepository.findByIdOrFail(input.classId);
    if (await this.streamRepository.findByClassAndName(input.classId, input.name)) {
      throw new ConflictException(`std_stream name already in use for this class: ${input.name}`);
    }
    return this.streamRepository.create({
      classId: input.classId,
      name: input.name,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<StdStreamEntity> {
    return this.streamRepository.findByIdOrFail(id);
  }

  async listByClass(classId: string): Promise<StdStreamEntity[]> {
    await this.classRepository.findByIdOrFail(classId);
    return this.streamRepository.listByClass(classId);
  }

  async update(id: string, changes: UpdateStdStreamInput, actorId: string | null): Promise<StdStreamEntity> {
    const stream = await this.streamRepository.findByIdOrFail(id);
    if (changes.name !== undefined) stream.name = changes.name;
    stream.updatedBy = actorId;
    return this.streamRepository.save(stream);
  }

  /**
   * Hard DELETE (Phase 6 Slice 2b — Class/Stream delete). Same shape as
   * `ClassesService.delete()`: `std_student.stream_id` and
   * `bill_fee_structure.stream_id` (`domains/billing` — a real gap found
   * during this pass's own live verification, see
   * `StdStreamRepository.countFeeStructureReferences()`'s doc comment) are
   * both real `onDelete: "RESTRICT"` FKs, so a referenced stream is
   * pre-checked and rejected with a specific `ConflictException` naming
   * the real counts, rather than letting a raw DB FK-violation surface to
   * the client.
   */
  async delete(id: string, actorId: string | null): Promise<void> {
    await this.streamRepository.findByIdOrFail(id);
    const [studentCount, feeStructureCount] = await Promise.all([
      this.studentRepository.countByStreamId(id),
      this.streamRepository.countFeeStructureReferences(id),
    ]);
    if (studentCount > 0 || feeStructureCount > 0) {
      const parts: string[] = [];
      if (studentCount > 0) parts.push(`${studentCount} student(s)`);
      if (feeStructureCount > 0) parts.push(`${feeStructureCount} fee structure(s)`);
      throw new ConflictException(`Cannot delete stream: ${parts.join(" and ")} still reference it`);
    }
    void actorId; // accepted for signature parity with create()/update() and future audit-trail use; a deleted row has no updatedBy to stamp.
    await this.streamRepository.delete(id);
  }
}
