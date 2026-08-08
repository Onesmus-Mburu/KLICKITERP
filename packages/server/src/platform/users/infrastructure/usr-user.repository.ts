import { Injectable } from "@nestjs/common";
import { EntityManager, In, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { UsrUserEntity } from "../domain/usr-user.entity";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";

/**
 * Canonical CRUD/administration repository for `usr_user`, owned by the
 * users module (module-boundary decision — see Module 1 report). `auth`
 * has its own, narrower `usr-user.repository.ts` for authentication-mechanics
 * queries (credential lookup, last-login stamping); both wrap the same
 * `Repository<UsrUserEntity>` — TypeORM repositories are DataSource+Entity
 * keyed, so registering `UsrUserEntity` via `TypeOrmModule.forFeature` in
 * two modules is standard practice, not duplication of state.
 */
@Injectable()
export class UsrUserRepository {
  constructor(
    @InjectRepository(UsrUserEntity)
    private readonly repo: Repository<UsrUserEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<UsrUserEntity | null> {
    return (manager?.getRepository(UsrUserEntity) ?? this.repo).findOne({
      where: { id },
      relations: { department: true },
    });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<UsrUserEntity> {
    const user = await this.findById(id, manager);
    if (!user) {
      throw new NotFoundException("User", id);
    }
    return user;
  }

  async save(entity: UsrUserEntity, manager?: EntityManager): Promise<UsrUserEntity> {
    return (manager?.getRepository(UsrUserEntity) ?? this.repo).save(entity);
  }

  async create(data: Partial<UsrUserEntity>, manager?: EntityManager): Promise<UsrUserEntity> {
    const repo = manager?.getRepository(UsrUserEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async list(
    options: { departmentId?: string; status?: string; q?: string; skip?: number; take?: number } = {},
  ): Promise<[UsrUserEntity[], number]> {
    const qb = this.repo.createQueryBuilder("u").leftJoinAndSelect("u.department", "department");
    if (options.departmentId) {
      qb.andWhere("u.departmentId = :departmentId", { departmentId: options.departmentId });
    }
    if (options.status) {
      qb.andWhere("u.status = :status", { status: options.status });
    }
    if (options.q) {
      qb.andWhere("(u.username ILIKE :q OR u.fullName ILIKE :q OR u.email ILIKE :q OR u.phone ILIKE :q)", {
        q: `%${options.q}%`,
      });
    }
    qb.orderBy("u.createdAt", "DESC");
    if (options.skip !== undefined) qb.skip(options.skip);
    if (options.take !== undefined) qb.take(options.take);
    return qb.getManyAndCount();
  }

  async existsByUsername(username: string): Promise<boolean> {
    const count = await this.repo.count({ where: { username } });
    return count > 0;
  }

  /** Username lookup for admin/CLI tooling (`tools/bootstrap-admin.ts`'s `--username` flags) — mirrors `existsByUsername`'s query shape. */
  async findByUsername(username: string): Promise<UsrUserEntity | null> {
    return this.repo.findOne({ where: { username } });
  }

  /** Bulk lookup by id — first consumer is `comms` module's `EXPLICIT_USER_IDS` broadcast audience resolution. */
  async findManyByIds(ids: string[], manager?: EntityManager): Promise<UsrUserEntity[]> {
    if (ids.length === 0) return [];
    return (manager?.getRepository(UsrUserEntity) ?? this.repo).find({ where: { id: In(ids) } });
  }
}
