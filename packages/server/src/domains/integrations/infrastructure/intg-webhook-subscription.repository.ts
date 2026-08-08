import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { IntgWebhookSubscriptionEntity } from "../domain/intg-webhook-subscription.entity";

@Injectable()
export class IntgWebhookSubscriptionRepository {
  constructor(
    @InjectRepository(IntgWebhookSubscriptionEntity)
    private readonly repo: Repository<IntgWebhookSubscriptionEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<IntgWebhookSubscriptionEntity | null> {
    return (manager?.getRepository(IntgWebhookSubscriptionEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<IntgWebhookSubscriptionEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("IntgWebhookSubscription", id);
    return row;
  }

  async list(manager?: EntityManager): Promise<IntgWebhookSubscriptionEntity[]> {
    return (manager?.getRepository(IntgWebhookSubscriptionEntity) ?? this.repo).find({ order: { createdAt: "DESC" } });
  }

  /**
   * FR-INTG-007.1 dispatch entrypoint — `WebhookDeliveryService.dispatch()`'s
   * "one delivery per matching subscription" fan-out, array-contains query
   * against `events` (`events @> ARRAY[...]` equivalent, expressed here as
   * `:eventType = ANY(sub.events)` — TypeORM's QueryBuilder rewrites the
   * camelCase `sub.isActive`/`sub.events` property references against the
   * real snake_case columns, same pattern this codebase's other
   * `createQueryBuilder()` call sites already rely on, e.g.
   * `WallTransactionRepository`/`FaAssetRepository`).
   */
  async findActiveForEvent(eventType: string, manager?: EntityManager): Promise<IntgWebhookSubscriptionEntity[]> {
    const repo = manager?.getRepository(IntgWebhookSubscriptionEntity) ?? this.repo;
    return repo
      .createQueryBuilder("sub")
      .where("sub.isActive = true")
      .andWhere(":eventType = ANY(sub.events)", { eventType })
      .getMany();
  }

  async create(data: Partial<IntgWebhookSubscriptionEntity>, manager?: EntityManager): Promise<IntgWebhookSubscriptionEntity> {
    const repo = manager?.getRepository(IntgWebhookSubscriptionEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: IntgWebhookSubscriptionEntity, manager?: EntityManager): Promise<IntgWebhookSubscriptionEntity> {
    return (manager?.getRepository(IntgWebhookSubscriptionEntity) ?? this.repo).save(entity);
  }
}
