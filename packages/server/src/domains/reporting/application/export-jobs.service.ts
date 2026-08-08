import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { FilesService } from "../../../platform/files";
import { RptExportJobEntity } from "../domain/rpt-export-job.entity";
import { RptExportJobRepository } from "../infrastructure/rpt-export-job.repository";
import { buildCsv } from "./csv-export.util";
import { ReportRegistryService } from "./report-registry.service";

export type ExportJobFormat = "CSV" | "XLSX" | "PDF";

export interface CreateExportJobInput {
  reportCode: string;
  params: Record<string, unknown>;
  format: ExportJobFormat;
  requestedBy: string;
}

/** FR-RPT-005.1's ">10k rows or >10s -> background job" threshold — see class doc comment "Row-count threshold". */
const BACKGROUND_JOB_ROW_THRESHOLD = 10_000;

const EXPORT_JOB_FILE_ENTITY_TYPE = "rpt_export_job";

/**
 * FR-RPT-003.1/FR-RPT-005.1 — executes a report via `ReportRegistryService`
 * and produces its export artifact, tracked as an `rpt_export_job` row.
 *
 * **`format` has no dedicated `rpt_export_job` column** — a genuine
 * foundation-pass schema gap: migration `0160`'s DDL for `rpt_export_job`
 * carries `report_code`/`params`/`requested_by`/`status`/`file_id`/
 * `expires_at` only, no `format` column at all (unlike `rpt_schedule`,
 * which DOES have one). Adding a migration to close this was out of this
 * pass's own scope (the task brief names no new migration for PASS B), so
 * `format` is threaded through inside `params` under a reserved
 * `__exportFormat` key — recoverable from the persisted row without a
 * schema change, documented here rather than silently dropped.
 *
 * **CSV — real, synchronous, RFC 4180 + UTF-8 BOM generation** (`buildCsv()`,
 * `csv-export.util.ts`), uploaded via `platform/files`' `FilesService.upload()`,
 * `file_id` set, `status='DONE'`.
 *
 * **XLSX/PDF — deliberately `status='QUEUED'` and STOP THERE.** Real
 * spreadsheet/PDF rendering (with branding, headers/footers, per
 * FR-RPT-003.1) is a genuinely large templating/rendering subsystem that
 * does not belong half-built in this pass — same honest deferral this
 * codebase already applies to payslip PDFs (`PyrlRunLineEntity.payslipFileId`
 * stays null) and real statutory filing-format outputs
 * (`StatutorySummaryReport`'s own doc comment). A job left `QUEUED` here is
 * NOT picked up by anything yet — no worker/queue exists in this codebase
 * (same structural gap `RptExportJobRepository.findQueued()`'s own doc
 * comment already names).
 *
 * **Row-count threshold (FR-RPT-005.1)** — `>10k rows` is checked and
 * documented as a structural placeholder for a future background-worker
 * route: `if (result.rows.length > BACKGROUND_JOB_ROW_THRESHOLD) { /* future:
 * route to worker *\/ }`, but BOTH branches currently do the identical
 * synchronous work, since no worker/queue exists to actually background
 * anything (same gap as every other cron/queue-shaped placeholder in this
 * codebase). The seam is real and ready for a future pass to wire a queue
 * into, without this method's own call signature changing.
 */
@Injectable()
export class ExportJobsService {
  private readonly logger = new Logger(ExportJobsService.name);

  constructor(
    private readonly registry: ReportRegistryService,
    private readonly exportJobRepository: RptExportJobRepository,
    private readonly filesService: FilesService,
  ) {}

  async createJob(em: EntityManager, input: CreateExportJobInput): Promise<RptExportJobEntity> {
    const definition = this.registry.get(input.reportCode);

    let job = await this.exportJobRepository.create(
      {
        reportCode: input.reportCode,
        params: { ...input.params, __exportFormat: input.format },
        requestedBy: input.requestedBy,
        status: "RUNNING",
        fileId: null,
        expiresAt: null,
        createdBy: input.requestedBy,
        updatedBy: input.requestedBy,
      },
      em,
    );

    try {
      const result = await definition.execute(input.params, { userId: input.requestedBy, permissions: [] });

      if (result.rows.length > BACKGROUND_JOB_ROW_THRESHOLD) {
        // Future: route to a background worker queue once one exists in this codebase.
        // No queue exists today, so both branches of this threshold check fall through
        // to the identical synchronous processing below — see class doc comment.
      }

      if (input.format === "CSV") {
        const buffer = buildCsv(definition.columns, result.rows);
        const file = await this.filesService.upload({
          buffer,
          originalName: `${input.reportCode}-${job.id}.csv`,
          mime: "text/csv",
          uploadedByUserId: input.requestedBy,
          entityType: EXPORT_JOB_FILE_ENTITY_TYPE,
          entityId: job.id,
        });
        job.fileId = file.id;
        job.status = "DONE";
      } else {
        // XLSX/PDF — deferred, see class doc comment.
        job.status = "QUEUED";
      }

      job.updatedBy = input.requestedBy;
      job = await this.exportJobRepository.save(job, em);
      return job;
    } catch (error) {
      job.status = "FAILED";
      job.updatedBy = input.requestedBy;
      await this.exportJobRepository.save(job, em);
      this.logger.warn(`Export job ${job.id} (${input.reportCode}) failed: ${(error as Error).message}`);
      throw error;
    }
  }

  async findByIdOrFail(id: string, em?: EntityManager): Promise<RptExportJobEntity> {
    return this.exportJobRepository.findByIdOrFail(id, em);
  }

  async listByRequester(requestedBy: string, em?: EntityManager): Promise<RptExportJobEntity[]> {
    return this.exportJobRepository.listByRequester(requestedBy, em);
  }
}
