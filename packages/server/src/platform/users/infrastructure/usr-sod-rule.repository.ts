import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UsrSodRuleEntity } from "../domain/usr-sod-rule.entity";
import { SodPair } from "../../../shared/rbac/sod-check.service";

@Injectable()
export class UsrSodRuleRepository {
  constructor(
    @InjectRepository(UsrSodRuleEntity)
    private readonly repo: Repository<UsrSodRuleEntity>,
  ) {}

  /** Returns enabled pairs as plain permission-code pairs for `SodCheckService` (shared kernel takes no entity types). */
  async listEnabledPairs(): Promise<SodPair[]> {
    const rules = await this.repo.find({
      where: { isEnabled: true },
      relations: { permissionA: true, permissionB: true },
    });
    return rules.map((rule) => ({
      permissionACode: rule.permissionA.code,
      permissionBCode: rule.permissionB.code,
    }));
  }

  async create(data: { permissionAId: string; permissionBId: string; isEnabled?: boolean }): Promise<UsrSodRuleEntity> {
    return this.repo.save(this.repo.create(data));
  }
}
