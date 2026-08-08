import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { CommChannel, CommTemplateEntity } from "../domain/comm-template.entity";

@Injectable()
export class CommTemplateRepository {
  constructor(
    @InjectRepository(CommTemplateEntity)
    private readonly repo: Repository<CommTemplateEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<CommTemplateEntity | null> {
    return (manager?.getRepository(CommTemplateEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<CommTemplateEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("CommTemplate", id);
    return row;
  }

  /** Exact `(eventCode, channel, locale)` lookup — `TemplatesService.render()` falls back to `locale='en'` itself when this misses. */
  async findByEventChannelLocale(
    eventCode: string,
    channel: CommChannel,
    locale: string,
    manager?: EntityManager,
  ): Promise<CommTemplateEntity | null> {
    return (manager?.getRepository(CommTemplateEntity) ?? this.repo).findOne({
      where: { eventCode, channel, locale },
    });
  }

  async list(manager?: EntityManager): Promise<CommTemplateEntity[]> {
    return (manager?.getRepository(CommTemplateEntity) ?? this.repo).find({ order: { createdAt: "DESC" } });
  }

  async create(data: Partial<CommTemplateEntity>, manager?: EntityManager): Promise<CommTemplateEntity> {
    const repo = manager?.getRepository(CommTemplateEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: CommTemplateEntity, manager?: EntityManager): Promise<CommTemplateEntity> {
    return (manager?.getRepository(CommTemplateEntity) ?? this.repo).save(entity);
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(CommTemplateEntity) ?? this.repo).delete({ id });
  }
}
