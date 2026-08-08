import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrLoginEventEntity } from "../../users/domain/usr-login-event.entity";

@Injectable()
export class UsrLoginEventRepository {
  constructor(
    @InjectRepository(UsrLoginEventEntity)
    private readonly repo: Repository<UsrLoginEventEntity>,
  ) {}

  /** Append-only — every login attempt (success or failure) writes exactly one row. */
  async record(
    data: {
      userId: string | null;
      usernameAttempted: string;
      success: boolean;
      failureReason?: string | null;
      ip: string;
      deviceFp: string;
    },
    manager?: EntityManager,
  ): Promise<UsrLoginEventEntity> {
    const repo = manager?.getRepository(UsrLoginEventEntity) ?? this.repo;
    return repo.save(
      repo.create({
        userId: data.userId,
        usernameAttempted: data.usernameAttempted,
        success: data.success,
        failureReason: data.failureReason ?? null,
        ip: data.ip,
        deviceFp: data.deviceFp,
      }),
    );
  }
}
