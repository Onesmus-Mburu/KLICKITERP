import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcGrnEntity } from "../domain/proc-grn.entity";

/** Plain repository wrapper for `proc_grn`. */
@Injectable()
export class ProcGrnRepository {
  constructor(
    @InjectRepository(ProcGrnEntity)
    private readonly repo: Repository<ProcGrnEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcGrnEntity | null> {
    return (manager?.getRepository(ProcGrnEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcGrnEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcGrn", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<ProcGrnEntity | null> {
    return (manager?.getRepository(ProcGrnEntity) ?? this.repo).findOne({ where: { number } });
  }

  async findByPoId(poId: string, manager?: EntityManager): Promise<ProcGrnEntity[]> {
    return (manager?.getRepository(ProcGrnEntity) ?? this.repo).find({
      where: { poId },
      order: { receivedAt: "ASC" },
    });
  }

  async create(data: Partial<ProcGrnEntity>, manager?: EntityManager): Promise<ProcGrnEntity> {
    const repo = manager?.getRepository(ProcGrnEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcGrnEntity, manager?: EntityManager): Promise<ProcGrnEntity> {
    return (manager?.getRepository(ProcGrnEntity) ?? this.repo).save(entity);
  }
}
