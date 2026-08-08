import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaVerificationLineEntity } from "../domain/fa-verification-line.entity";

/** Plain repository wrapper for `fa_verification_line`, plus `findByVerificationId()`. */
@Injectable()
export class FaVerificationLineRepository {
  constructor(
    @InjectRepository(FaVerificationLineEntity)
    private readonly repo: Repository<FaVerificationLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaVerificationLineEntity | null> {
    return (manager?.getRepository(FaVerificationLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaVerificationLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaVerificationLine", id);
    return row;
  }

  /** All counted lines of a verification session — the variance/missing-asset report entry point the next pass needs. */
  async findByVerificationId(verificationId: string, manager?: EntityManager): Promise<FaVerificationLineEntity[]> {
    return (manager?.getRepository(FaVerificationLineEntity) ?? this.repo).find({ where: { verificationId } });
  }

  async create(
    data: Partial<FaVerificationLineEntity>,
    manager?: EntityManager,
  ): Promise<FaVerificationLineEntity> {
    const repo = manager?.getRepository(FaVerificationLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaVerificationLineEntity, manager?: EntityManager): Promise<FaVerificationLineEntity> {
    return (manager?.getRepository(FaVerificationLineEntity) ?? this.repo).save(entity);
  }
}
