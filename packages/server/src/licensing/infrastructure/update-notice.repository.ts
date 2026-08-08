import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { UpdateNoticeEntity } from "../domain/update-notice.entity";

@Injectable()
export class UpdateNoticeRepository {
  constructor(
    @InjectRepository(UpdateNoticeEntity)
    private readonly repo: Repository<UpdateNoticeEntity>,
  ) {}

  async create(data: Partial<UpdateNoticeEntity>): Promise<UpdateNoticeEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async findById(id: string): Promise<UpdateNoticeEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<UpdateNoticeEntity> {
    const row = await this.findById(id);
    if (!row) {
      throw new NotFoundException("UpdateNotice", id);
    }
    return row;
  }

  async list(limit = 50): Promise<UpdateNoticeEntity[]> {
    return this.repo.find({ order: { receivedAt: "DESC" }, take: limit });
  }

  async save(entity: UpdateNoticeEntity): Promise<UpdateNoticeEntity> {
    return this.repo.save(entity);
  }
}
