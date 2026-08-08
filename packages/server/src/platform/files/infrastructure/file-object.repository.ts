import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FileObjectEntity } from "../domain/file-object.entity";

@Injectable()
export class FileObjectRepository {
  constructor(
    @InjectRepository(FileObjectEntity)
    private readonly repo: Repository<FileObjectEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FileObjectEntity | null> {
    return (manager?.getRepository(FileObjectEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FileObjectEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FileObject", id);
    return row;
  }

  async listByEntity(entityType: string, entityId: string, manager?: EntityManager): Promise<FileObjectEntity[]> {
    return (manager?.getRepository(FileObjectEntity) ?? this.repo).find({
      where: { entityType, entityId },
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<FileObjectEntity>, manager?: EntityManager): Promise<FileObjectEntity> {
    const repo = manager?.getRepository(FileObjectEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(FileObjectEntity) ?? this.repo).delete({ id });
  }
}
