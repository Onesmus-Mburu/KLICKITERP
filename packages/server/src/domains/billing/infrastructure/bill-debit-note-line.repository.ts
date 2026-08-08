import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillDebitNoteLineEntity } from "../domain/bill-debit-note-line.entity";

@Injectable()
export class BillDebitNoteLineRepository {
  constructor(
    @InjectRepository(BillDebitNoteLineEntity)
    private readonly repo: Repository<BillDebitNoteLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillDebitNoteLineEntity | null> {
    return (manager?.getRepository(BillDebitNoteLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillDebitNoteLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillDebitNoteLine", id);
    return row;
  }

  async listByDebitNote(debitNoteId: string, manager?: EntityManager): Promise<BillDebitNoteLineEntity[]> {
    return (manager?.getRepository(BillDebitNoteLineEntity) ?? this.repo).find({
      where: { debitNoteId },
      order: { lineNo: "ASC" },
    });
  }

  async create(data: Partial<BillDebitNoteLineEntity>, manager?: EntityManager): Promise<BillDebitNoteLineEntity> {
    const repo = manager?.getRepository(BillDebitNoteLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillDebitNoteLineEntity, manager?: EntityManager): Promise<BillDebitNoteLineEntity> {
    return (manager?.getRepository(BillDebitNoteLineEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(BillDebitNoteLineEntity) ?? this.repo).delete(id);
  }
}
