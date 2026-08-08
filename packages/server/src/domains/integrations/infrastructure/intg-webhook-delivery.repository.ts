import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { IntgWebhookDeliveryEntity } from "../domain/intg-webhook-delivery.entity";

export interface ListDeliveriesOptions {
  subscriptionId?: string;
  status?: IntgWebhookDeliveryEntity["status"];
  limit?: number;
  offset?: number;
}

@Injectable()
export class IntgWebhookDeliveryRepository {
  constructor(
    @InjectRepository(IntgWebhookDeliveryEntity)
    private readonly repo: Repository<IntgWebhookDeliveryEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<IntgWebhookDeliveryEntity | null> {
    return (manager?.getRepository(IntgWebhookDeliveryEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<IntgWebhookDeliveryEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("IntgWebhookDelivery", id);
    return row;
  }

  async list(options: ListDeliveriesOptions, manager?: EntityManager): Promise<[IntgWebhookDeliveryEntity[], number]> {
    const repo = manager?.getRepository(IntgWebhookDeliveryEntity) ?? this.repo;
    return repo.findAndCount({
      where: {
        ...(options.subscriptionId ? { subscriptionId: options.subscriptionId } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      order: { createdAt: "DESC" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
  }

  /**
   * The partial-index-serviced query docs/phase-4/04-schema-operations.md §6
   * calls out explicitly: `ix_intg_webhook_delivery_due` on `(next_retry_at)
   * WHERE status IN ('PENDING','FAILED')` — this predicate matches that
   * index exactly, so `WebhookDeliveryService.processDue()` always hits it.
   */
  async findDueForRetry(asOfDate: Date, manager?: EntityManager): Promise<IntgWebhookDeliveryEntity[]> {
    const repo = manager?.getRepository(IntgWebhookDeliveryEntity) ?? this.repo;
    return repo
      .createQueryBuilder("d")
      .where("d.status IN (:...statuses)", { statuses: ["PENDING", "FAILED"] })
      .andWhere("d.nextRetryAt <= :asOfDate", { asOfDate })
      .orderBy("d.nextRetryAt", "ASC")
      .getMany();
  }

  async create(data: Partial<IntgWebhookDeliveryEntity>, manager?: EntityManager): Promise<IntgWebhookDeliveryEntity> {
    const repo = manager?.getRepository(IntgWebhookDeliveryEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: IntgWebhookDeliveryEntity, manager?: EntityManager): Promise<IntgWebhookDeliveryEntity> {
    return (manager?.getRepository(IntgWebhookDeliveryEntity) ?? this.repo).save(entity);
  }
}
