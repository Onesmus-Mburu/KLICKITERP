import { Injectable } from "@nestjs/common";
import { Money } from "../../../shared/money/money";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { WallServicePointEntity, WallServicePointType } from "../domain/wall-service-point.entity";
import { WallServicePointOperatorEntity } from "../domain/wall-service-point-operator.entity";
import { WallServicePointRepository } from "../infrastructure/wall-service-point.repository";
import { WallServicePointOperatorRepository } from "../infrastructure/wall-service-point-operator.repository";

export interface CreateServicePointInput {
  name: string;
  type: WallServicePointType;
  glIncomeAccountId: string;
  perTxnLimit?: Money | null;
}

export interface UpdateServicePointInput {
  name?: string;
  perTxnLimit?: Money | null;
  isActive?: boolean;
}

/** CRUD for `wall_service_point` + operator assign/unassign (`wall_service_point_operator`). */
@Injectable()
export class ServicePointsService {
  constructor(
    private readonly servicePointRepository: WallServicePointRepository,
    private readonly operatorRepository: WallServicePointOperatorRepository,
  ) {}

  async create(input: CreateServicePointInput, actorId: string): Promise<WallServicePointEntity> {
    const existing = await this.servicePointRepository.findByName(input.name);
    if (existing) {
      throw new ValidationException(`ServicePointsService.create: a service point named "${input.name}" already exists`);
    }
    return this.servicePointRepository.create({
      name: input.name,
      type: input.type,
      glIncomeAccountId: input.glIncomeAccountId,
      isActive: true,
      perTxnLimit: input.perTxnLimit ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async update(id: string, input: UpdateServicePointInput, actorId: string): Promise<WallServicePointEntity> {
    const servicePoint = await this.servicePointRepository.findByIdOrFail(id);
    if (input.name !== undefined) servicePoint.name = input.name;
    if (input.perTxnLimit !== undefined) servicePoint.perTxnLimit = input.perTxnLimit;
    if (input.isActive !== undefined) servicePoint.isActive = input.isActive;
    servicePoint.updatedBy = actorId;
    return this.servicePointRepository.save(servicePoint);
  }

  async findByIdOrFail(id: string): Promise<WallServicePointEntity> {
    return this.servicePointRepository.findByIdOrFail(id);
  }

  async list(): Promise<WallServicePointEntity[]> {
    return this.servicePointRepository.list();
  }

  async assignOperator(servicePointId: string, userId: string, actorId: string): Promise<WallServicePointOperatorEntity> {
    await this.servicePointRepository.findByIdOrFail(servicePointId);
    const existing = await this.operatorRepository.findOne(servicePointId, userId);
    if (existing) return existing;
    return this.operatorRepository.create({ servicePointId, userId, createdBy: actorId, updatedBy: actorId });
  }

  async unassignOperator(servicePointId: string, userId: string): Promise<void> {
    const existing = await this.operatorRepository.findOne(servicePointId, userId);
    if (!existing) return;
    await this.operatorRepository.remove(existing);
  }

  async listOperators(servicePointId: string): Promise<WallServicePointOperatorEntity[]> {
    return this.operatorRepository.listByServicePoint(servicePointId);
  }
}
