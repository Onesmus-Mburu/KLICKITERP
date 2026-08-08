import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PaySuspenseItemEntity } from "../domain/pay-suspense-item.entity";

/**
 * Plain repository wrapper for `pay_suspense_item`, plus `findOpen()` — the
 * BR-PAY-07 suspense digest lookup (`ix_pay_suspense_open_p`) the next
 * pass's C2B auto-match/manual-match/daily-digest services will need
 * immediately.
 */
@Injectable()
export class PaySuspenseItemRepository {
  constructor(
    @InjectRepository(PaySuspenseItemEntity)
    private readonly repo: Repository<PaySuspenseItemEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PaySuspenseItemEntity | null> {
    return (manager?.getRepository(PaySuspenseItemEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PaySuspenseItemEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PaySuspenseItem", id);
    return row;
  }

  /** BR-PAY-07: every OPEN suspense item, oldest received first. */
  async findOpen(manager?: EntityManager): Promise<PaySuspenseItemEntity[]> {
    return (manager?.getRepository(PaySuspenseItemEntity) ?? this.repo).find({
      where: { state: "OPEN" },
      order: { receivedAt: "ASC" },
    });
  }

  async create(data: Partial<PaySuspenseItemEntity>, manager?: EntityManager): Promise<PaySuspenseItemEntity> {
    const repo = manager?.getRepository(PaySuspenseItemEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PaySuspenseItemEntity, manager?: EntityManager): Promise<PaySuspenseItemEntity> {
    return (manager?.getRepository(PaySuspenseItemEntity) ?? this.repo).save(entity);
  }
}
