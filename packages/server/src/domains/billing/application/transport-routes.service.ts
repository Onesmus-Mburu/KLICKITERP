import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { BillTransportRouteEntity } from "../domain/bill-transport-route.entity";
import { BillTransportRouteRepository } from "../infrastructure/bill-transport-route.repository";

export interface CreateTransportRouteInput {
  name: string;
  amount: Money;
}

export interface UpdateTransportRouteInput {
  name?: string;
  amount?: Money;
}

/** CRUD for `bill_transport_route` — straightforward per the task brief. */
@Injectable()
export class TransportRoutesService {
  constructor(private readonly transportRouteRepository: BillTransportRouteRepository) {}

  async create(input: CreateTransportRouteInput, actorId: string | null): Promise<BillTransportRouteEntity> {
    if (await this.transportRouteRepository.findByName(input.name)) {
      throw new ConflictException(`bill_transport_route name already in use: ${input.name}`);
    }
    return this.transportRouteRepository.create({
      name: input.name,
      amount: input.amount,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<BillTransportRouteEntity> {
    return this.transportRouteRepository.findByIdOrFail(id);
  }

  async list(): Promise<BillTransportRouteEntity[]> {
    return this.transportRouteRepository.list();
  }

  async update(id: string, changes: UpdateTransportRouteInput, actorId: string | null): Promise<BillTransportRouteEntity> {
    const route = await this.transportRouteRepository.findByIdOrFail(id);
    if (changes.name !== undefined) route.name = changes.name;
    if (changes.amount !== undefined) route.amount = changes.amount;
    route.updatedBy = actorId;
    return this.transportRouteRepository.save(route);
  }

  async deactivate(id: string, actorId: string | null): Promise<BillTransportRouteEntity> {
    const route = await this.transportRouteRepository.findByIdOrFail(id);
    route.isActive = false;
    route.updatedBy = actorId;
    return this.transportRouteRepository.save(route);
  }

  async activate(id: string, actorId: string | null): Promise<BillTransportRouteEntity> {
    const route = await this.transportRouteRepository.findByIdOrFail(id);
    route.isActive = true;
    route.updatedBy = actorId;
    return this.transportRouteRepository.save(route);
  }
}
