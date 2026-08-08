import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillCreditNoteLineEntity } from "../domain/bill-credit-note-line.entity";

@Injectable()
export class BillCreditNoteLineRepository {
  constructor(
    @InjectRepository(BillCreditNoteLineEntity)
    private readonly repo: Repository<BillCreditNoteLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillCreditNoteLineEntity | null> {
    return (manager?.getRepository(BillCreditNoteLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillCreditNoteLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillCreditNoteLine", id);
    return row;
  }

  async listByCreditNote(creditNoteId: string, manager?: EntityManager): Promise<BillCreditNoteLineEntity[]> {
    return (manager?.getRepository(BillCreditNoteLineEntity) ?? this.repo).find({
      where: { creditNoteId },
      order: { lineNo: "ASC" },
    });
  }

  async create(
    data: Partial<BillCreditNoteLineEntity>,
    manager?: EntityManager,
  ): Promise<BillCreditNoteLineEntity> {
    const repo = manager?.getRepository(BillCreditNoteLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillCreditNoteLineEntity, manager?: EntityManager): Promise<BillCreditNoteLineEntity> {
    return (manager?.getRepository(BillCreditNoteLineEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(BillCreditNoteLineEntity) ?? this.repo).delete(id);
  }
}
