import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillCreditNoteEntity } from "../domain/bill-credit-note.entity";

@Injectable()
export class BillCreditNoteRepository {
  constructor(
    @InjectRepository(BillCreditNoteEntity)
    private readonly repo: Repository<BillCreditNoteEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillCreditNoteEntity | null> {
    return (manager?.getRepository(BillCreditNoteEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillCreditNoteEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillCreditNote", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<BillCreditNoteEntity | null> {
    return (manager?.getRepository(BillCreditNoteEntity) ?? this.repo).findOne({ where: { number } });
  }

  async listByInvoice(invoiceId: string, manager?: EntityManager): Promise<BillCreditNoteEntity[]> {
    return (manager?.getRepository(BillCreditNoteEntity) ?? this.repo).find({ where: { invoiceId } });
  }

  async create(data: Partial<BillCreditNoteEntity>, manager?: EntityManager): Promise<BillCreditNoteEntity> {
    const repo = manager?.getRepository(BillCreditNoteEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillCreditNoteEntity, manager?: EntityManager): Promise<BillCreditNoteEntity> {
    return (manager?.getRepository(BillCreditNoteEntity) ?? this.repo).save(entity);
  }
}
