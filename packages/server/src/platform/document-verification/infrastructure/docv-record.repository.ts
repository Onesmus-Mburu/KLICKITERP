import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { DocvRecordEntity } from "../domain/docv-record.entity";

@Injectable()
export class DocvRecordRepository {
  constructor(
    @InjectRepository(DocvRecordEntity)
    private readonly repo: Repository<DocvRecordEntity>,
  ) {}

  /** `manager` is REQUIRED in practice (`DocumentVerificationService.mint()` always passes the caller's own transaction `EntityManager`) but kept optional here, same signature shape every other repository in this codebase uses. */
  async create(data: Partial<DocvRecordEntity>, manager?: EntityManager): Promise<DocvRecordEntity> {
    const repo = manager?.getRepository(DocvRecordEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async findByToken(token: string, manager?: EntityManager): Promise<DocvRecordEntity | null> {
    return (manager?.getRepository(DocvRecordEntity) ?? this.repo).findOne({ where: { token } });
  }

  /** Ordered `createdAt DESC` defensively — `mint()` is normally called at most once per `(documentType, documentId)`, but a most-recent-wins tiebreak is a safe, cheap guard against ever silently returning a stale row if a caller re-mints. */
  async findByDocument(documentType: string, documentId: string, manager?: EntityManager): Promise<DocvRecordEntity | null> {
    return (manager?.getRepository(DocvRecordEntity) ?? this.repo).findOne({
      where: { documentType, documentId },
      order: { createdAt: "DESC" },
    });
  }
}
