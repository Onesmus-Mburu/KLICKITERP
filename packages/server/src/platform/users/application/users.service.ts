import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { DataSource } from "typeorm";
import { randomBytes } from "node:crypto";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { UsrUserEntity, UsrUserStatus, UsrUserType } from "../domain/usr-user.entity";
import { UsrDepartmentEntity } from "../domain/usr-department.entity";
import { UsrUserRepository } from "../infrastructure/usr-user.repository";
import { UsrUserRoleRepository } from "../infrastructure/usr-user-role.repository";
import { UserStatusChangedEvent } from "../events/user-status-changed.event";

const BCRYPT_ROUNDS = 12;

/** State machine (task spec): INVITED -> ACTIVE -> SUSPENDED/DEACTIVATED; illegal transitions rejected. */
const ALLOWED_TRANSITIONS: Record<UsrUserStatus, readonly UsrUserStatus[]> = {
  INVITED: ["ACTIVE", "DEACTIVATED"],
  ACTIVE: ["SUSPENDED", "DEACTIVATED"],
  SUSPENDED: ["ACTIVE", "DEACTIVATED"],
  DEACTIVATED: [],
};

export interface CreateUserInput {
  username: string;
  email?: string | null;
  phone?: string | null;
  fullName: string;
  userType?: UsrUserType;
  departmentId?: string | null;
  locale?: string;
}

export interface CreateUserResult {
  user: UsrUserEntity;
  /** Plaintext temporary password — shown to the creating admin exactly once, delivery is out of scope for Module 1. */
  temporaryPassword: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userRepository: UsrUserRepository,
    private readonly userRoleRepository: UsrUserRoleRepository,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  async create(input: CreateUserInput, actorId: string | null): Promise<CreateUserResult> {
    if (!input.phone && !input.email && input.userType !== "PARENT") {
      // ck_usr_user_contact_or_parent — defense-in-depth ahead of the DB CHECK (G-04).
      throw new ValidationException("A STAFF/SYSTEM user requires an email or phone");
    }
    if (await this.userRepository.existsByUsername(input.username)) {
      throw new ConflictException(`Username already in use: ${input.username}`);
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    const user = await this.userRepository.create({
      username: input.username,
      email: input.email ?? null,
      phone: input.phone ?? null,
      fullName: input.fullName,
      userType: input.userType ?? "STAFF",
      departmentId: input.departmentId ?? null,
      locale: input.locale ?? "en",
      passwordHash,
      status: "INVITED",
      mustChangePassword: true,
      twofaEnabled: false,
      createdBy: actorId,
      updatedBy: actorId,
    });

    return { user, temporaryPassword };
  }

  async findByIdOrFail(id: string): Promise<UsrUserEntity> {
    return this.userRepository.findByIdOrFail(id);
  }

  /** Username lookup, `null` if none — first consumer is `tools/bootstrap-admin.ts` resolving `--username` to a user id. */
  async findByUsername(username: string): Promise<UsrUserEntity | null> {
    return this.userRepository.findByUsername(username);
  }

  async list(options: {
    departmentId?: string;
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: UsrUserEntity[];
    total: number;
  }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const [items, total] = await this.userRepository.list({
      departmentId: options.departmentId,
      status: options.status,
      q: options.q,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total };
  }

  async updateProfile(
    userId: string,
    changes: { fullName?: string; email?: string | null; phone?: string | null; locale?: string },
    actorId: string | null,
  ): Promise<UsrUserEntity> {
    const user = await this.userRepository.findByIdOrFail(userId);
    if (changes.fullName !== undefined) user.fullName = changes.fullName;
    if (changes.email !== undefined) user.email = changes.email;
    if (changes.phone !== undefined) user.phone = changes.phone;
    if (changes.locale !== undefined) user.locale = changes.locale;
    user.updatedBy = actorId;
    return this.userRepository.save(user);
  }

  /** Enforces the INVITED->ACTIVE->SUSPENDED/DEACTIVATED state machine and emits `UserStatusChangedEvent`. */
  async changeStatus(userId: string, targetStatus: UsrUserStatus, actorId: string | null): Promise<UsrUserEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const user = await this.userRepository.findByIdOrFail(userId, manager);
      const allowed = ALLOWED_TRANSITIONS[user.status];
      if (!allowed.includes(targetStatus)) {
        throw new ValidationException(
          `Illegal user status transition: ${user.status} -> ${targetStatus}`,
          { from: user.status, to: targetStatus, allowed },
        );
      }
      const fromStatus = user.status;
      user.status = targetStatus;
      user.updatedBy = actorId;
      const saved = await this.userRepository.save(user, manager);

      await this.outboxWriter.write(
        manager,
        new UserStatusChangedEvent(saved.id, { fromStatus, toStatus: targetStatus, actorId }),
      );

      return saved;
    });
  }

  async assignDepartment(userId: string, departmentId: string | null, actorId: string | null): Promise<UsrUserEntity> {
    const user = await this.userRepository.findByIdOrFail(userId);
    user.departmentId = departmentId;
    // `findByIdOrFail` (via `UsrUserRepository.findById`) eager-loads the
    // `department` relation (Phase 6 Slice 13 Part 1). `UsrUserEntity` has
    // both a scalar `departmentId` column and a `@ManyToOne`/`@JoinColumn
    // department` on the SAME `department_id` column — the identical
    // duplicate-scalar-plus-relation shape `DepartmentsService.update()` had
    // for `headUserId`/`headUser` (Phase 6 Slice 13 Part 3's own confirmed,
    // fixed defect). Left unsynced, a stale loaded `user.department` object
    // silently wins over the scalar in `save()`, so this keeps it in sync on
    // every change — mirrors that fix exactly.
    user.department = departmentId === null ? null : ({ id: departmentId } as UsrDepartmentEntity);
    user.updatedBy = actorId;
    return this.userRepository.save(user);
  }

  /** FR-USER-005.1 — `authority_limit_amount`, Money-typed (never a raw JS number). */
  async setAuthorityLimit(userId: string, amount: Money | null, actorId: string | null): Promise<UsrUserEntity> {
    const user = await this.userRepository.findByIdOrFail(userId);
    user.authorityLimitAmount = amount;
    user.updatedBy = actorId;
    return this.userRepository.save(user);
  }

  /** Bulk lookup by id, in no particular order — `comms` module's `EXPLICIT_USER_IDS` broadcast audience resolution (BroadcastsService, since `platform/students`/guardians doesn't exist yet). */
  async listByIds(ids: string[]): Promise<UsrUserEntity[]> {
    return this.userRepository.findManyByIds(ids);
  }

  /** ACTIVE users currently granted `roleId` — `comms` module's `STAFF_ROLE` broadcast audience resolution. */
  async listActiveUsersByRoleId(roleId: string): Promise<UsrUserEntity[]> {
    const userIds = await this.userRoleRepository.findUserIdsForRole(roleId);
    if (userIds.length === 0) return [];
    const users = await this.userRepository.findManyByIds(userIds);
    return users.filter((user) => user.status === "ACTIVE");
  }

  /** Whether `userId` currently holds `roleId` — `platform/approvals`' `ROLE` approver-type check (`ApprovalEngineService.decide()`/`.listPendingForApprover()`). */
  async hasRole(userId: string, roleId: string): Promise<boolean> {
    return this.userRoleRepository.exists(userId, roleId);
  }
}

function generateTemporaryPassword(): string {
  // 24 random bytes -> base64url, comfortably clears any reasonable password policy.
  return randomBytes(24).toString("base64url");
}
