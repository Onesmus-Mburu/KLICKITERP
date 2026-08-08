import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { RptExportJobEntity, RptExportJobStatus } from "../domain/rpt-export-job.entity";

/**
 * Plain repository wrapper for `rpt_export_job`. Module 18 (Reporting)
 * **foundation pass only** — the worker that consumes `findQueued()`,
 * generates the file, and flips the job to `DONE`/`FAILED` is a later pass's
 * concern, see docs/phase-5/PROGRESS.md.
 */
@Injectable()
export class RptExportJobRepository {
  constructor(
    @InjectRepository(RptExportJobEntity)
    private readonly repo: Repository<RptExportJobEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<RptExportJobEntity | null> {
    return (manager?.getRepository(RptExportJobEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<RptExportJobEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("RptExportJob", id);
    return row;
  }

  async listByRequester(requestedBy: string, manager?: EntityManager): Promise<RptExportJobEntity[]> {
    return (manager?.getRepository(RptExportJobEntity) ?? this.repo).find({
      where: { requestedBy },
      order: { createdAt: "DESC" },
    });
  }

  /** `QUEUED` jobs, oldest first — the next pass's worker poll query, backed by `ix_rpt_export_job_status_p`. */
  async findQueued(manager?: EntityManager): Promise<RptExportJobEntity[]> {
    return (manager?.getRepository(RptExportJobEntity) ?? this.repo).find({
      where: { status: "QUEUED" as RptExportJobStatus },
      order: { createdAt: "ASC" },
    });
  }

  async create(data: Partial<RptExportJobEntity>, manager?: EntityManager): Promise<RptExportJobEntity> {
    const repo = manager?.getRepository(RptExportJobEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: RptExportJobEntity, manager?: EntityManager): Promise<RptExportJobEntity> {
    return (manager?.getRepository(RptExportJobEntity) ?? this.repo).save(entity);
  }
}
