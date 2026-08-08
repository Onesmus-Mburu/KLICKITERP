import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillTransportRouteEntity } from "../domain/bill-transport-route.entity";

@Injectable()
export class BillTransportRouteRepository {
  constructor(
    @InjectRepository(BillTransportRouteEntity)
    private readonly repo: Repository<BillTransportRouteEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillTransportRouteEntity | null> {
    return (manager?.getRepository(BillTransportRouteEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillTransportRouteEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillTransportRoute", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<BillTransportRouteEntity | null> {
    return (manager?.getRepository(BillTransportRouteEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<BillTransportRouteEntity[]> {
    return (manager?.getRepository(BillTransportRouteEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(data: Partial<BillTransportRouteEntity>, manager?: EntityManager): Promise<BillTransportRouteEntity> {
    const repo = manager?.getRepository(BillTransportRouteEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillTransportRouteEntity, manager?: EntityManager): Promise<BillTransportRouteEntity> {
    return (manager?.getRepository(BillTransportRouteEntity) ?? this.repo).save(entity);
  }
}
