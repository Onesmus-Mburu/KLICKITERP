import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillStudentOptionalItemEntity } from "../domain/bill-student-optional-item.entity";

@Injectable()
export class BillStudentOptionalItemRepository {
  constructor(
    @InjectRepository(BillStudentOptionalItemEntity)
    private readonly repo: Repository<BillStudentOptionalItemEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillStudentOptionalItemEntity | null> {
    return (manager?.getRepository(BillStudentOptionalItemEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillStudentOptionalItemEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillStudentOptionalItem", id);
    return row;
  }

  async listByStudentAndTerm(
    studentId: string,
    termId: string,
    manager?: EntityManager,
  ): Promise<BillStudentOptionalItemEntity[]> {
    return (manager?.getRepository(BillStudentOptionalItemEntity) ?? this.repo).find({
      where: { studentId, termId },
    });
  }

  async create(
    data: Partial<BillStudentOptionalItemEntity>,
    manager?: EntityManager,
  ): Promise<BillStudentOptionalItemEntity> {
    const repo = manager?.getRepository(BillStudentOptionalItemEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(
    entity: BillStudentOptionalItemEntity,
    manager?: EntityManager,
  ): Promise<BillStudentOptionalItemEntity> {
    return (manager?.getRepository(BillStudentOptionalItemEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(BillStudentOptionalItemEntity) ?? this.repo).delete(id);
  }
}
