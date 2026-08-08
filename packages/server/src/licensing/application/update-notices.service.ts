import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { UpdateNoticeDecision, UpdateNoticeEntity, UpdateNoticeUrgency } from "../domain/update-notice.entity";
import { UpdateNoticeRepository } from "../infrastructure/update-notice.repository";

export interface RecordUpdateNoticeInput {
  version: string;
  notes: string;
  urgency: UpdateNoticeUrgency;
  mandatoryBy?: string | null;
}

/** `decision`'s legal forward transitions (docs/phase-4/04-schema-operations.md §7's own listed lifecycle: `PENDING -> SCHEDULED -> APPLIED`, or `-> DECLINED`). */
const ALLOWED_DECISION_TRANSITIONS: Record<UpdateNoticeDecision, readonly UpdateNoticeDecision[]> = {
  PENDING: ["SCHEDULED", "DECLINED"],
  SCHEDULED: ["APPLIED", "DECLINED"],
  APPLIED: [],
  DECLINED: [],
};

/**
 * CRUD/decision-tracking for `license.update_notice`. `record()` is what
 * `LicenseApiService.updateNotice()` calls (the one HTTP-reachable write
 * path in this pass, via `POST /license/v1/update-notice`). `decide()` is
 * the school-admin-facing decision step (`PENDING -> SCHEDULED/DECLINED`,
 * `SCHEDULED -> APPLIED/DECLINED`) — implemented and unit tested here, but
 * NOT wired to an HTTP endpoint in this pass: the task's own controller
 * surface only names `GET /license/update-notices` (read-only) for
 * `license-status.controller.ts`, no write endpoint — a small, honestly
 * documented scope note (docs/phase-5/PROGRESS.md) rather than an oversight.
 */
@Injectable()
export class UpdateNoticesService {
  constructor(private readonly repository: UpdateNoticeRepository) {}

  async record(input: RecordUpdateNoticeInput): Promise<UpdateNoticeEntity> {
    return this.repository.create({
      // Wire-level field is `version` (matches FR-LIC-002.1's payload naming);
      // the entity's own column is `releaseVersion` — see UpdateNoticeEntity's
      // own doc comment for why (collision with MutableBaseEntity's `version`
      // optimistic-lock column).
      releaseVersion: input.version,
      notes: input.notes,
      urgency: input.urgency,
      mandatoryBy: input.mandatoryBy ?? null,
      receivedAt: new Date(),
      appliedAt: null,
      decision: "PENDING",
    });
  }

  async list(limit = 50): Promise<UpdateNoticeEntity[]> {
    return this.repository.list(limit);
  }

  async decide(id: string, decision: UpdateNoticeDecision): Promise<UpdateNoticeEntity> {
    const notice = await this.repository.findByIdOrFail(id);
    const allowed = ALLOWED_DECISION_TRANSITIONS[notice.decision] ?? [];
    if (!allowed.includes(decision)) {
      throw new ConflictException(`Cannot move update notice from "${notice.decision}" to "${decision}"`, {
        from: notice.decision,
        to: decision,
      });
    }
    notice.decision = decision;
    if (decision === "APPLIED") {
      notice.appliedAt = new Date();
    }
    return this.repository.save(notice);
  }
}
