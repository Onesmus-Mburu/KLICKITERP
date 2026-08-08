import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcPoLineEntity } from "../domain/proc-po-line.entity";

/** Plain repository wrapper for `proc_po_line`, plus `findByPoId()`. */
@Injectable()
export class ProcPoLineRepository {
  constructor(
    @InjectRepository(ProcPoLineEntity)
    private readonly repo: Repository<ProcPoLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcPoLineEntity | null> {
    return (manager?.getRepository(ProcPoLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcPoLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcPoLine", id);
    return row;
  }

  /** All lines of a PO, ordered by `line_no` — the GRN-receiving/3-way-match entry point the next pass needs. */
  async findByPoId(poId: string, manager?: EntityManager): Promise<ProcPoLineEntity[]> {
    return (manager?.getRepository(ProcPoLineEntity) ?? this.repo).find({
      where: { poId },
      order: { lineNo: "ASC" },
    });
  }

  async create(data: Partial<ProcPoLineEntity>, manager?: EntityManager): Promise<ProcPoLineEntity> {
    const repo = manager?.getRepository(ProcPoLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcPoLineEntity, manager?: EntityManager): Promise<ProcPoLineEntity> {
    return (manager?.getRepository(ProcPoLineEntity) ?? this.repo).save(entity);
  }
}
