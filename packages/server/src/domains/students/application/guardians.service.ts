import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { StdGuardianEntity } from "../domain/std-guardian.entity";
import { StdStudentGuardianEntity } from "../domain/std-student-guardian.entity";
import { StdGuardianRepository } from "../infrastructure/std-guardian.repository";
import { StdStudentGuardianRepository } from "../infrastructure/std-student-guardian.repository";
import { StdStudentRepository } from "../infrastructure/std-student.repository";

export interface CreateStdGuardianInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  nationalId?: string | null;
  userId?: string | null;
}

export interface UpdateStdGuardianInput {
  fullName?: string;
  email?: string | null;
  nationalId?: string | null;
  userId?: string | null;
}

/**
 * CRUD for `std_guardian` + the student↔guardian link (`std_student_guardian`).
 * `linkToStudent()` enforces "exactly one primary guardian per student"
 * (`uq_std_student_guardian_primary_p`, a partial unique index) via the
 * unset-previous-primary-then-set pattern inside `tx()`, the same shape used
 * for every other "exactly one" invariant in this codebase
 * (`AcademicCalendarService.setCurrentYear`, `ThemesService.publish()`,
 * `BudgetsService.onApprovalDecided()`).
 */
@Injectable()
export class GuardiansService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly guardianRepository: StdGuardianRepository,
    private readonly studentGuardianRepository: StdStudentGuardianRepository,
    private readonly studentRepository: StdStudentRepository,
  ) {}

  /**
   * Phase 6 Slice 2c — sibling guardian dedup. Previously threw a
   * `ConflictException` on a duplicate `phone` (and had NO dedup at all for
   * `email` — two guardians with the same email but different/no phone
   * silently became two separate records). Real-use gap: creating/importing
   * a second child whose father/mother phone or email matches an
   * already-existing guardian (a genuine sibling) should link both children
   * to the SAME guardian record, not fail or silently duplicate.
   *
   * New semantics — find-then-create-or-reuse, never a conflict for a
   * genuine phone/email match: **phone is checked FIRST** (it has the
   * stronger, DB-backed uniqueness guarantee — `uq_std_guardian_phone_p`, a
   * real partial unique index), and only if no phone match is found (or no
   * phone was supplied) is `email` checked (no DB uniqueness constraint on
   * `email` by design — see this method's own scope note below). Whichever
   * matches first wins; if a submission's phone matches guardian A while its
   * email independently matches guardian B, guardian A (the phone match) is
   * returned — phone's real DB constraint makes it the more trustworthy
   * signal of "this is genuinely the same person," so it takes precedence
   * over an email match that could coincidentally collide. `wasExisting`
   * tells the caller whether a fresh record was created or an existing one
   * was reused, so the UI can say "Linked to existing guardian {name}" vs.
   * "New guardian created" instead of staying silent about what happened.
   *
   * **Scope note**: no DB uniqueness constraint is added on `email` here —
   * this find-then-create-or-reuse flow prevents new duplicates through
   * normal app usage without one; a hard DB constraint would need its own
   * migration and could conflict with any duplicate emails already sitting
   * in the live dev DB from prior verification passes across this project —
   * deliberately out of scope.
   */
  async create(
    input: CreateStdGuardianInput,
    actorId: string | null,
  ): Promise<{ guardian: StdGuardianEntity; wasExisting: boolean }> {
    if (!input.phone && !input.email) {
      // ck_std_guardian_contact — defense-in-depth ahead of the DB CHECK (G-04),
      // mirroring UsersService.create()'s ck_usr_user_contact_or_parent check exactly.
      throw new ValidationException("A guardian requires a phone or an email");
    }
    if (input.phone) {
      const existingByPhone = await this.guardianRepository.findByPhone(input.phone);
      if (existingByPhone) {
        return { guardian: existingByPhone, wasExisting: true };
      }
    }
    if (input.email) {
      const existingByEmail = await this.guardianRepository.findByEmail(input.email);
      if (existingByEmail) {
        return { guardian: existingByEmail, wasExisting: true };
      }
    }
    const guardian = await this.guardianRepository.create({
      fullName: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      nationalId: input.nationalId ?? null,
      userId: input.userId ?? null,
      payoutVerified: null,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return { guardian, wasExisting: false };
  }

  async findByIdOrFail(id: string): Promise<StdGuardianEntity> {
    return this.guardianRepository.findByIdOrFail(id);
  }

  /**
   * The Parents directory's own list — each guardian paired with its real
   * linked-student count (`std_student_guardian` rows), computed via one
   * bulk query (`countLinkedStudentsForGuardians()`), not N+1 per-guardian
   * calls. Returned as `{guardian, studentCount}` pairs rather than mutating
   * `studentCount` onto the entity itself — mirrors `create()`'s own
   * `{guardian, wasExisting}` shape immediately above, letting the
   * controller do the actual response-DTO flattening, same division of
   * responsibility.
   */
  async list(): Promise<Array<{ guardian: StdGuardianEntity; studentCount: number }>> {
    const guardians = await this.guardianRepository.list();
    const counts = await this.guardianRepository.countLinkedStudentsForGuardians(guardians.map((g) => g.id));
    return guardians.map((guardian) => ({ guardian, studentCount: counts.get(guardian.id) ?? 0 }));
  }

  async update(id: string, changes: UpdateStdGuardianInput, actorId: string | null): Promise<StdGuardianEntity> {
    const guardian = await this.guardianRepository.findByIdOrFail(id);
    if (changes.fullName !== undefined) guardian.fullName = changes.fullName;
    if (changes.email !== undefined) guardian.email = changes.email;
    if (changes.nationalId !== undefined) guardian.nationalId = changes.nationalId;
    if (changes.userId !== undefined) guardian.userId = changes.userId;
    guardian.updatedBy = actorId;
    return this.guardianRepository.save(guardian);
  }

  async listForStudent(studentId: string): Promise<StdStudentGuardianEntity[]> {
    return this.studentGuardianRepository.listByStudent(studentId);
  }

  /**
   * Phase 6 — the reverse of `listForStudent()`: which students a guardian is
   * linked to. `StdStudentGuardianRepository.listByGuardian()` already
   * existed (used internally nowhere before this) but had no controller
   * route exposing it — added for the standalone Parents page, which needs
   * to show a guardian's own children without a per-student round trip.
   */
  async listForGuardian(guardianId: string): Promise<StdStudentGuardianEntity[]> {
    return this.studentGuardianRepository.listByGuardian(guardianId);
  }

  /**
   * Links (or updates the link attributes of) a guardian to a student. When
   * `isPrimary=true`, the previous primary link (if any, and if different
   * from this one) is unset inside the same transaction before this one is
   * set, so `uq_std_student_guardian_primary_p` is never violated mid-flight.
   */
  async linkToStudent(
    studentId: string,
    guardianId: string,
    relationship: string,
    isPrimary: boolean,
    receivesBilling: boolean,
    actorId: string | null,
  ): Promise<StdStudentGuardianEntity> {
    await this.studentRepository.findByIdOrFail(studentId);
    await this.guardianRepository.findByIdOrFail(guardianId);

    return runInTransaction(this.dataSource, async (manager) => {
      const existingLink = await this.studentGuardianRepository.findByStudentAndGuardian(
        studentId,
        guardianId,
        manager,
      );

      if (isPrimary) {
        const previousPrimary = await this.studentGuardianRepository.findPrimaryForStudent(studentId, manager);
        if (previousPrimary && (!existingLink || previousPrimary.id !== existingLink.id)) {
          previousPrimary.isPrimary = false;
          previousPrimary.updatedBy = actorId;
          await this.studentGuardianRepository.save(previousPrimary, manager);
        }
      }

      if (existingLink) {
        existingLink.relationship = relationship;
        existingLink.isPrimary = isPrimary;
        existingLink.receivesBilling = receivesBilling;
        existingLink.updatedBy = actorId;
        return this.studentGuardianRepository.save(existingLink, manager);
      }

      return this.studentGuardianRepository.create(
        {
          studentId,
          guardianId,
          relationship,
          isPrimary,
          receivesBilling,
          createdBy: actorId,
          updatedBy: actorId,
        },
        manager,
      );
    });
  }

  async unlinkFromStudent(studentId: string, guardianId: string): Promise<void> {
    const link = await this.studentGuardianRepository.findByStudentAndGuardian(studentId, guardianId);
    if (!link) {
      return;
    }
    await this.studentGuardianRepository.delete(link.id);
  }
}
