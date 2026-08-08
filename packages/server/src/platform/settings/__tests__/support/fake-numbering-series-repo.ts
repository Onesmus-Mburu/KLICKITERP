import { EntityManager } from "typeorm";
import { SetNumberingSeriesEntity } from "../../domain/set-numbering-series.entity";

/**
 * Minimal in-memory stand-in for `EntityManager.getRepository(SetNumberingSeriesEntity)`,
 * covering only the calls `NumberingService.allocate()` makes
 * (`findOne` with/without a lock, `create`, `save`) — real enough to
 * exercise the allocator's actual control flow (auto-create-on-first-use,
 * rollover, the create-race fallback) rather than asserting on mock call
 * shapes alone.
 */
export class FakeNumberingSeriesRepo {
  readonly rows: SetNumberingSeriesEntity[] = [];
  private nextId = 1;

  /** Arms the next `save()` of a brand-new (no `id`) row to fail with a unique-violation and, as a side effect, plants `winner` as though a concurrent transaction committed it first. */
  private pendingConcurrentWinner: SetNumberingSeriesEntity | null = null;

  seed(data: Partial<SetNumberingSeriesEntity> & { createdAt?: Date }): SetNumberingSeriesEntity {
    const row = this.materialize(data);
    if (!row.id) row.id = `row-${this.nextId++}`;
    this.rows.push(row);
    return row;
  }

  armConcurrentWinner(winner: SetNumberingSeriesEntity): void {
    this.pendingConcurrentWinner = winner;
  }

  create(data: Partial<SetNumberingSeriesEntity>): SetNumberingSeriesEntity {
    return this.materialize(data);
  }

  async findOne(options: {
    where: Partial<Record<keyof SetNumberingSeriesEntity, unknown>>;
    order?: { createdAt?: "ASC" | "DESC" };
    lock?: { mode: string };
  }): Promise<SetNumberingSeriesEntity | null> {
    const entries = Object.entries(options.where);
    let candidates = this.rows.filter((row) =>
      entries.every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value),
    );
    if (options.order?.createdAt === "DESC") {
      candidates = [...candidates].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return candidates[0] ?? null;
  }

  async save(entity: SetNumberingSeriesEntity): Promise<SetNumberingSeriesEntity> {
    if (!entity.id) {
      if (this.pendingConcurrentWinner) {
        const winner = this.pendingConcurrentWinner;
        this.pendingConcurrentWinner = null;
        this.rows.push(winner);
        const error = new Error("duplicate key value violates unique constraint") as Error & { code: string };
        error.code = "23505";
        throw error;
      }
      entity.id = `row-${this.nextId++}`;
      this.rows.push(entity);
      return entity;
    }
    const index = this.rows.findIndex((row) => row.id === entity.id);
    if (index >= 0) this.rows[index] = entity;
    return entity;
  }

  private materialize(data: Partial<SetNumberingSeriesEntity> & { createdAt?: Date }): SetNumberingSeriesEntity {
    return {
      id: "",
      createdAt: data.createdAt ?? new Date(),
      updatedAt: new Date(),
      createdBy: null,
      updatedBy: null,
      version: 1,
      docType: "",
      seriesCode: "MAIN",
      prefix: "",
      padWidth: 6,
      resetPolicy: "NEVER",
      periodKey: "NONE",
      nextNo: "1",
      ...data,
    } as SetNumberingSeriesEntity;
  }
}

/** Wraps a `FakeNumberingSeriesRepo` as the subset of `EntityManager` `NumberingService.allocate()` calls. */
export function makeFakeEntityManager(repo: FakeNumberingSeriesRepo): EntityManager {
  return { getRepository: () => repo } as unknown as EntityManager;
}
