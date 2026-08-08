import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaVerificationEntity, FaVerificationStatus } from "../domain/fa-verification.entity";

export interface ListFaVerificationsFilter {
  status?: FaVerificationStatus;
}

/** Plain repository wrapper for `fa_verification`. */
@Injectable()
export class FaVerificationRepository {
  constructor(
    @InjectRepository(FaVerificationEntity)
    private readonly repo: Repository<FaVerificationEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaVerificationEntity | null> {
    return (manager?.getRepository(FaVerificationEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaVerificationEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaVerification", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<FaVerificationEntity | null> {
    return (manager?.getRepository(FaVerificationEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(filter: ListFaVerificationsFilter = {}, manager?: EntityManager): Promise<FaVerificationEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(FaVerificationEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<FaVerificationEntity>, manager?: EntityManager): Promise<FaVerificationEntity> {
    const repo = manager?.getRepository(FaVerificationEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaVerificationEntity, manager?: EntityManager): Promise<FaVerificationEntity> {
    return (manager?.getRepository(FaVerificationEntity) ?? this.repo).save(entity);
  }
}
