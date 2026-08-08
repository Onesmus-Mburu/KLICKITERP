import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { InvTransferLineEntity } from "../domain/inv-transfer-line.entity";

/** Plain repository wrapper for `inv_transfer_line`, plus `findByTransferId()`. */
@Injectable()
export class InvTransferLineRepository {
  constructor(
    @InjectRepository(InvTransferLineEntity)
    private readonly repo: Repository<InvTransferLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvTransferLineEntity | null> {
    return (manager?.getRepository(InvTransferLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvTransferLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvTransferLine", id);
    return row;
  }

  /** All lines of a transfer, ordered by `line_no` — the receive-side reconciliation entry point the next pass needs. */
  async findByTransferId(transferId: string, manager?: EntityManager): Promise<InvTransferLineEntity[]> {
    return (manager?.getRepository(InvTransferLineEntity) ?? this.repo).find({
      where: { transferId },
      order: { lineNo: "ASC" },
    });
  }

  async create(data: Partial<InvTransferLineEntity>, manager?: EntityManager): Promise<InvTransferLineEntity> {
    const repo = manager?.getRepository(InvTransferLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: InvTransferLineEntity, manager?: EntityManager): Promise<InvTransferLineEntity> {
    return (manager?.getRepository(InvTransferLineEntity) ?? this.repo).save(entity);
  }
}
