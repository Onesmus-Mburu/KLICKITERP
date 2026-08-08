import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ApiCallLogEntity } from "../domain/api-call-log.entity";

export interface ListApiCallLogOptions {
  limit?: number;
  offset?: number;
}

/** BR-LIC-04's school-visible call log — `license-status.controller.ts`'s `GET /license/api-log` reads this. */
@Injectable()
export class ApiCallLogRepository {
  constructor(
    @InjectRepository(ApiCallLogEntity)
    private readonly repo: Repository<ApiCallLogEntity>,
  ) {}

  async create(data: Partial<ApiCallLogEntity>): Promise<ApiCallLogEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async list(options: ListApiCallLogOptions = {}): Promise<[ApiCallLogEntity[], number]> {
    return this.repo.findAndCount({
      order: { at: "DESC" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
  }
}
