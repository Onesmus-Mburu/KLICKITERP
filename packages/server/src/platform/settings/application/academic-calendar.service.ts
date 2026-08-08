import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { SetAcademicYearEntity } from "../domain/set-academic-year.entity";
import { SetTermEntity } from "../domain/set-term.entity";
import { SetAcademicYearRepository } from "../infrastructure/set-academic-year.repository";
import { SetTermRepository } from "../infrastructure/set-term.repository";
import { AcademicYearChangedEvent } from "../events/academic-year-changed.event";
import { TermCurrentChangedEvent } from "../events/term-current-changed.event";

export interface CreateAcademicYearInput {
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface CreateTermInput {
  academicYearId: string;
  name: string;
  seq: number;
  startsOn: string;
  endsOn: string;
}

/** Fields `updateTerm` refuses to change once `billing_locked=true` — see class doc comment. */
const BILLING_AFFECTING_TERM_FIELDS = ["seq", "startsOn", "endsOn"] as const;

/**
 * Academic year + term CRUD, and the "exactly one current" invariant for
 * both (`uq_set_year_current_p` / `uq_set_term_current_p` partial unique
 * indexes at the DB layer — this service's `setCurrentYear`/`setCurrentTerm`
 * unset the previous current row inside the same transaction as setting the
 * new one, so those indexes are never violated mid-flight, per the entity
 * doc comments).
 *
 * `billingLocked` on `set_term` is a guard flag: once true, `updateTerm`
 * rejects edits to billing-affecting fields (`seq`/`startsOn`/`endsOn`) —
 * actual billing enforcement (e.g. blocking new invoices dated in a locked
 * term) is the future billing module's concern, this is just the toggle and
 * the guard around this module's own term-editing surface.
 */
@Injectable()
export class AcademicCalendarService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly academicYearRepository: SetAcademicYearRepository,
    private readonly termRepository: SetTermRepository,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  // ---- Academic years -----------------------------------------------

  async createYear(input: CreateAcademicYearInput, actorId: string | null): Promise<SetAcademicYearEntity> {
    if (await this.academicYearRepository.findByName(input.name)) {
      throw new ConflictException(`Academic year name already in use: ${input.name}`);
    }
    // Defense-in-depth ahead of any future DB CHECK — no ck_set_academic_year_dates constraint
    // exists yet, so this is currently the only guard against an inverted year.
    if (input.startsOn >= input.endsOn) {
      throw new ValidationException(
        `Academic year "${input.name}" startsOn (${input.startsOn}) must be before endsOn (${input.endsOn})`,
      );
    }
    return this.academicYearRepository.create({
      name: input.name,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      isCurrent: false,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async listYears(): Promise<SetAcademicYearEntity[]> {
    return this.academicYearRepository.list();
  }

  async findYearByIdOrFail(id: string): Promise<SetAcademicYearEntity> {
    return this.academicYearRepository.findByIdOrFail(id);
  }

  async updateYear(
    id: string,
    changes: { name?: string; startsOn?: string; endsOn?: string },
    actorId: string | null,
  ): Promise<SetAcademicYearEntity> {
    const year = await this.academicYearRepository.findByIdOrFail(id);
    if (changes.name !== undefined) year.name = changes.name;
    if (changes.startsOn !== undefined) year.startsOn = changes.startsOn;
    if (changes.endsOn !== undefined) year.endsOn = changes.endsOn;
    // Defense-in-depth ahead of any future DB CHECK — re-validated against the post-change
    // values (not just the changed field(s) in isolation) so a partial update can never leave
    // startsOn/endsOn inverted.
    if (year.startsOn >= year.endsOn) {
      throw new ValidationException(
        `Academic year "${year.name}" startsOn (${year.startsOn}) must be before endsOn (${year.endsOn})`,
      );
    }
    year.updatedBy = actorId;
    return this.academicYearRepository.save(year);
  }

  /** Read-only current-year lookup, usable inside a caller's own transaction (e.g. `NumberingService`). */
  async getCurrentYear(manager?: EntityManager): Promise<SetAcademicYearEntity | null> {
    return this.academicYearRepository.findCurrent(manager);
  }

  /** Unsets the previous current year (if any) and sets `id` as current, atomically. */
  async setCurrentYear(id: string, actorId: string | null): Promise<SetAcademicYearEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const target = await this.academicYearRepository.findByIdOrFail(id, manager);
      const previous = await this.academicYearRepository.findCurrent(manager);

      if (previous && previous.id !== target.id) {
        previous.isCurrent = false;
        previous.updatedBy = actorId;
        await this.academicYearRepository.save(previous, manager);
      }

      target.isCurrent = true;
      target.updatedBy = actorId;
      const saved = await this.academicYearRepository.save(target, manager);

      await this.outboxWriter.write(
        manager,
        new AcademicYearChangedEvent(saved.id, {
          fromYearId: previous && previous.id !== saved.id ? previous.id : null,
          toYearId: saved.id,
          actorId,
        }),
      );

      return saved;
    });
  }

  // ---- Terms -----------------------------------------------------------

  async createTerm(input: CreateTermInput, actorId: string | null): Promise<SetTermEntity> {
    await this.academicYearRepository.findByIdOrFail(input.academicYearId);
    if (await this.termRepository.findByYearAndSeq(input.academicYearId, input.seq)) {
      throw new ConflictException(
        `Term seq already in use for this academic year: ${input.academicYearId}/${input.seq}`,
      );
    }
    // Defense-in-depth ahead of any future DB CHECK — no ck_set_term_dates constraint exists yet.
    if (input.startsOn >= input.endsOn) {
      throw new ValidationException(
        `Term "${input.name}" startsOn (${input.startsOn}) must be before endsOn (${input.endsOn})`,
      );
    }
    return this.termRepository.create({
      academicYearId: input.academicYearId,
      name: input.name,
      seq: input.seq,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      isCurrent: false,
      billingLocked: false,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async listTerms(academicYearId?: string): Promise<SetTermEntity[]> {
    return this.termRepository.list(academicYearId);
  }

  /** Accepts an optional `EntityManager` (Phase 6 Slice 3b) so a caller (e.g. `FeeStructuresService`) can resolve a term inside its own caller-supplied transaction — same composable pattern as `getCurrentTerm()`. */
  async findTermByIdOrFail(id: string, manager?: EntityManager): Promise<SetTermEntity> {
    return this.termRepository.findByIdOrFail(id, manager);
  }

  async updateTerm(
    id: string,
    changes: { name?: string; seq?: number; startsOn?: string; endsOn?: string },
    actorId: string | null,
  ): Promise<SetTermEntity> {
    const term = await this.termRepository.findByIdOrFail(id);

    if (term.billingLocked) {
      const attemptedLockedField = BILLING_AFFECTING_TERM_FIELDS.find((field) => changes[field] !== undefined);
      if (attemptedLockedField) {
        throw new ValidationException(
          `Term "${term.name}" is billing-locked — "${attemptedLockedField}" cannot be changed until unlocked`,
          { termId: id, field: attemptedLockedField },
        );
      }
    }

    if (changes.name !== undefined) term.name = changes.name;
    if (changes.seq !== undefined) term.seq = changes.seq;
    if (changes.startsOn !== undefined) term.startsOn = changes.startsOn;
    if (changes.endsOn !== undefined) term.endsOn = changes.endsOn;
    // Defense-in-depth ahead of any future DB CHECK — re-validated against the post-change
    // values (not just the changed field(s) in isolation) so a partial update can never leave
    // startsOn/endsOn inverted.
    if (term.startsOn >= term.endsOn) {
      throw new ValidationException(
        `Term "${term.name}" startsOn (${term.startsOn}) must be before endsOn (${term.endsOn})`,
      );
    }
    term.updatedBy = actorId;
    return this.termRepository.save(term);
  }

  async setBillingLock(id: string, locked: boolean, actorId: string | null): Promise<SetTermEntity> {
    const term = await this.termRepository.findByIdOrFail(id);
    term.billingLocked = locked;
    term.updatedBy = actorId;
    return this.termRepository.save(term);
  }

  /** Read-only current-term lookup, usable inside a caller's own transaction (e.g. `NumberingService`). */
  async getCurrentTerm(manager?: EntityManager): Promise<SetTermEntity | null> {
    return this.termRepository.findCurrent(manager);
  }

  /**
   * Current term plus its parent academic year, in one round trip —
   * `NumberingService.allocate()`'s TERMLY reset policy needs the year's
   * `name` (short, human label) to build a `period_key`.
   */
  async getCurrentTermWithYear(
    manager?: EntityManager,
  ): Promise<{ term: SetTermEntity; year: SetAcademicYearEntity } | null> {
    const term = await this.termRepository.findCurrent(manager);
    if (!term) return null;
    const year = await this.academicYearRepository.findByIdOrFail(term.academicYearId, manager);
    return { term, year };
  }

  /** Unsets the previous current term (if any, global — not scoped by academic year) and sets `id` as current. */
  async setCurrentTerm(id: string, actorId: string | null): Promise<SetTermEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const target = await this.termRepository.findByIdOrFail(id, manager);
      const previous = await this.termRepository.findCurrent(manager);

      if (previous && previous.id !== target.id) {
        previous.isCurrent = false;
        previous.updatedBy = actorId;
        await this.termRepository.save(previous, manager);
      }

      target.isCurrent = true;
      target.updatedBy = actorId;
      const saved = await this.termRepository.save(target, manager);

      await this.outboxWriter.write(
        manager,
        new TermCurrentChangedEvent(saved.id, {
          fromTermId: previous && previous.id !== saved.id ? previous.id : null,
          toTermId: saved.id,
          actorId,
        }),
      );

      return saved;
    });
  }
}
