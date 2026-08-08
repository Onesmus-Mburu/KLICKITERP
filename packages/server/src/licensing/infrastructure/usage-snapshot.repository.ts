import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UsageSnapshotEntity } from "../domain/usage-snapshot.entity";

@Injectable()
export class UsageSnapshotRepository {
  constructor(
    @InjectRepository(UsageSnapshotEntity)
    private readonly repo: Repository<UsageSnapshotEntity>,
  ) {}

  async create(data: Partial<UsageSnapshotEntity>): Promise<UsageSnapshotEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async listRecent(limit = 50): Promise<UsageSnapshotEntity[]> {
    return this.repo.find({ order: { at: "DESC" }, take: limit });
  }
}
