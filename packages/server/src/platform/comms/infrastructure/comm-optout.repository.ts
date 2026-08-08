import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { CommChannel } from "../domain/comm-template.entity";
import { CommOptoutEntity } from "../domain/comm-optout.entity";

@Injectable()
export class CommOptoutRepository {
  constructor(
    @InjectRepository(CommOptoutEntity)
    private readonly repo: Repository<CommOptoutEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<CommOptoutEntity | null> {
    return (manager?.getRepository(CommOptoutEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<CommOptoutEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("CommOptout", id);
    return row;
  }

  async findOne(
    guardianId: string,
    channel: CommChannel,
    scope: string,
    manager?: EntityManager,
  ): Promise<CommOptoutEntity | null> {
    return (manager?.getRepository(CommOptoutEntity) ?? this.repo).findOne({
      where: { guardianId, channel, scope },
    });
  }

  async listByGuardian(guardianId: string, manager?: EntityManager): Promise<CommOptoutEntity[]> {
    return (manager?.getRepository(CommOptoutEntity) ?? this.repo).find({ where: { guardianId } });
  }

  async create(data: Partial<CommOptoutEntity>, manager?: EntityManager): Promise<CommOptoutEntity> {
    const repo = manager?.getRepository(CommOptoutEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(CommOptoutEntity) ?? this.repo).delete({ id });
  }
}
