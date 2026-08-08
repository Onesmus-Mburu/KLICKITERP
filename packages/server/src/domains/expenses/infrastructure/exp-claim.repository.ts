import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ExpClaimEntity, ExpClaimStatus } from "../domain/exp-claim.entity";

/** Plain repository wrapper for `exp_claim`. */
@Injectable()
export class ExpClaimRepository {
  constructor(
    @InjectRepository(ExpClaimEntity)
    private readonly repo: Repository<ExpClaimEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ExpClaimEntity | null> {
    return (manager?.getRepository(ExpClaimEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ExpClaimEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ExpClaim", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<ExpClaimEntity | null> {
    return (manager?.getRepository(ExpClaimEntity) ?? this.repo).findOne({ where: { number } });
  }

  async listByStaffUserId(
    staffUserId: string,
    status?: ExpClaimStatus,
    manager?: EntityManager,
  ): Promise<ExpClaimEntity[]> {
    const where: Record<string, unknown> = { staffUserId };
    if (status !== undefined) where.status = status;
    return (manager?.getRepository(ExpClaimEntity) ?? this.repo).find({ where, order: { createdAt: "DESC" } });
  }

  /** Admin/approver-facing listing, no staff filter — `ClaimsController`'s plain `GET` when no `staffUserId` query param is given. */
  async listAll(status?: ExpClaimStatus, manager?: EntityManager): Promise<ExpClaimEntity[]> {
    const where: Record<string, unknown> = {};
    if (status !== undefined) where.status = status;
    return (manager?.getRepository(ExpClaimEntity) ?? this.repo).find({ where, order: { createdAt: "DESC" } });
  }

  async create(data: Partial<ExpClaimEntity>, manager?: EntityManager): Promise<ExpClaimEntity> {
    const repo = manager?.getRepository(ExpClaimEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ExpClaimEntity, manager?: EntityManager): Promise<ExpClaimEntity> {
    return (manager?.getRepository(ExpClaimEntity) ?? this.repo).save(entity);
  }
}
