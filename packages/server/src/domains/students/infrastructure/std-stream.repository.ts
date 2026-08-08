import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { StdStreamEntity } from "../domain/std-stream.entity";

@Injectable()
export class StdStreamRepository {
  constructor(
    @InjectRepository(StdStreamEntity)
    private readonly repo: Repository<StdStreamEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<StdStreamEntity | null> {
    return (manager?.getRepository(StdStreamEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<StdStreamEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("StdStream", id);
    return row;
  }

  async findByClassAndName(classId: string, name: string, manager?: EntityManager): Promise<StdStreamEntity | null> {
    return (manager?.getRepository(StdStreamEntity) ?? this.repo).findOne({ where: { classId, name } });
  }

  async listByClass(classId: string, manager?: EntityManager): Promise<StdStreamEntity[]> {
    return (manager?.getRepository(StdStreamEntity) ?? this.repo).find({ where: { classId }, order: { name: "ASC" } });
  }

  async create(data: Partial<StdStreamEntity>, manager?: EntityManager): Promise<StdStreamEntity> {
    const repo = manager?.getRepository(StdStreamEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: StdStreamEntity, manager?: EntityManager): Promise<StdStreamEntity> {
    return (manager?.getRepository(StdStreamEntity) ?? this.repo).save(entity);
  }

  /** Phase 6 Slice 2b — Class/Stream delete: `ClassesService.delete()`'s referencing-stream pre-check (`std_stream.class_id` is `onDelete: "RESTRICT"`). */
  async countByClassId(classId: string, manager?: EntityManager): Promise<number> {
    return (manager?.getRepository(StdStreamEntity) ?? this.repo).count({ where: { classId } });
  }

  /** Hard DELETE — `StreamsService.delete()`'s only caller, called only after that service has confirmed no `std_student`/`bill_fee_structure` row references this stream. */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(StdStreamEntity) ?? this.repo).delete(id);
  }

  /** Cross-domain reference check ahead of delete — `bill_fee_structure.stream_id` (nullable). Same real gap/fix as `StdClassRepository.countFeeStructureReferences()`'s own doc comment describes in full; see that method for the fuller rationale. */
  async countFeeStructureReferences(streamId: string, manager?: EntityManager): Promise<number> {
    const source = manager ?? this.repo.manager;
    const rows: Array<{ count: string }> = await source.query(
      `SELECT COUNT(*)::int AS count FROM app.bill_fee_structure WHERE stream_id = $1`,
      [streamId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
