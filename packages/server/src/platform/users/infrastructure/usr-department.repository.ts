import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UsrDepartmentEntity } from "../domain/usr-department.entity";

@Injectable()
export class UsrDepartmentRepository {
  constructor(
    @InjectRepository(UsrDepartmentEntity)
    private readonly repo: Repository<UsrDepartmentEntity>,
  ) {}

  async findById(id: string): Promise<UsrDepartmentEntity | null> {
    return this.repo.findOne({ where: { id }, relations: { headUser: true } });
  }

  /**
   * Phase 6 Slice 13 Part 1 — `relations: { headUser: true }` added so
   * `headUserFullName` can populate here too. Note this is NOT bringing
   * list() to parity with an existing single-get join (the reverse of
   * `UsrUserRepository`'s situation) — `list()` had no join at all before
   * this pass; confirmed by reading the pre-existing code, not assumed.
   */
  async list(): Promise<UsrDepartmentEntity[]> {
    return this.repo.find({ order: { name: "ASC" }, relations: { headUser: true } });
  }

  async create(data: Partial<UsrDepartmentEntity>): Promise<UsrDepartmentEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async save(entity: UsrDepartmentEntity): Promise<UsrDepartmentEntity> {
    return this.repo.save(entity);
  }
}
