import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillDebitNoteEntity } from "../domain/bill-debit-note.entity";

@Injectable()
export class BillDebitNoteRepository {
  constructor(
    @InjectRepository(BillDebitNoteEntity)
    private readonly repo: Repository<BillDebitNoteEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillDebitNoteEntity | null> {
    return (manager?.getRepository(BillDebitNoteEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillDebitNoteEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillDebitNote", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<BillDebitNoteEntity | null> {
    return (manager?.getRepository(BillDebitNoteEntity) ?? this.repo).findOne({ where: { number } });
  }

  async listByStudent(studentId: string, manager?: EntityManager): Promise<BillDebitNoteEntity[]> {
    return (manager?.getRepository(BillDebitNoteEntity) ?? this.repo).find({ where: { studentId } });
  }

  async create(data: Partial<BillDebitNoteEntity>, manager?: EntityManager): Promise<BillDebitNoteEntity> {
    const repo = manager?.getRepository(BillDebitNoteEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillDebitNoteEntity, manager?: EntityManager): Promise<BillDebitNoteEntity> {
    return (manager?.getRepository(BillDebitNoteEntity) ?? this.repo).save(entity);
  }
}
