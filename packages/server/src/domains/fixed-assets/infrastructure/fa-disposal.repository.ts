import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaDisposalEntity, FaDisposalStatus } from "../domain/fa-disposal.entity";

export interface ListFaDisposalsFilter {
  status?: FaDisposalStatus;
}

/** Plain repository wrapper for `fa_disposal`, plus `findByAssetId()` — the UQ's own lookup. */
@Injectable()
export class FaDisposalRepository {
  constructor(
    @InjectRepository(FaDisposalEntity)
    private readonly repo: Repository<FaDisposalEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaDisposalEntity | null> {
    return (manager?.getRepository(FaDisposalEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaDisposalEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaDisposal", id);
    return row;
  }

  /** `asset_id` is UNIQUE — an asset can be disposed at most once, ever. */
  async findByAssetId(assetId: string, manager?: EntityManager): Promise<FaDisposalEntity | null> {
    return (manager?.getRepository(FaDisposalEntity) ?? this.repo).findOne({ where: { assetId } });
  }

  async list(filter: ListFaDisposalsFilter = {}, manager?: EntityManager): Promise<FaDisposalEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(FaDisposalEntity) ?? this.repo).find({ where, order: { createdAt: "DESC" } });
  }

  async create(data: Partial<FaDisposalEntity>, manager?: EntityManager): Promise<FaDisposalEntity> {
    const repo = manager?.getRepository(FaDisposalEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaDisposalEntity, manager?: EntityManager): Promise<FaDisposalEntity> {
    return (manager?.getRepository(FaDisposalEntity) ?? this.repo).save(entity);
  }
}
