import type {
  CreateFeeStructureDto,
  CreateFeeStructureLineDto,
  FeeStructureLineResponseDto,
  FeeStructureResponseDto,
  UpdateFeeStructureLineDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `FeeStructuresController`
 * (`packages/server/src/domains/billing/api/fee-structures.controller.ts`).
 * Permissions: `billing:fee-structure:manage`/`:view`/`:publish` — `publish`
 * is a genuinely DISTINCT permission from `manage` (confirmed by reading the
 * controller), so a user could see/edit a DRAFT structure but still 403 on
 * publish — `PublishFeeStructureButton` renders that as a real error, not a
 * silently-hidden button (nothing in this module hides UI based on a guessed
 * permission, per this codebase's own `<QueryBoundary>`-403-is-the-real-gate
 * convention).
 *
 * `GET /billing/fee-structures` REQUIRES both `academicYearId` and `classId`
 * (no default, confirmed by reading `FeeStructuresController.list()` — plain
 * `@Query()` params, not `@ApiQuery({required:false})`) — `useFeeStructures()`
 * only enables the query once both are chosen.
 *
 * **Phase 6 Slice 3b (Fee Structure Redesign)**: a structure now spans a
 * whole academic year — `termId` dropped from `CreateFeeStructureDto`/the
 * list filter/`FeeStructureResponseDto`; each LINE now carries its own
 * `termId`/`dueDate` instead (`CreateFeeStructureLineDto`/
 * `UpdateFeeStructureLineDto`/`FeeStructureLineResponseDto` all gained
 * both). `updateFeeStructureLine()` now sends the full editable set
 * (`amount`+`termId`+`dueDate`), not amount alone — confirmed against the
 * widened `UpdateFeeStructureLineDto`. New: `deleteFeeStructure()`
 * (`DELETE /billing/fee-structures/:id`, real `204`, blocked with a `409` if
 * any invoice still references it).
 *
 * Lines: `POST /billing/fee-structures/:id/lines` creates a line;
 * `POST /billing/fee-structures/lines/:lineId` updates a line — a real
 * `POST`, not `PATCH` (confirmed directly in the controller, not a typo in
 * this comment). Both are rejected server-side once the structure leaves
 * `DRAFT` (`FeeStructuresService.addLine()`/`updateLine()`'s own guard) —
 * the frontend mirrors that by only rendering the add/edit-line UI while
 * `status === "DRAFT"`, but the real enforcement is server-side.
 */
export async function listFeeStructures(academicYearId: string, classId: string): Promise<FeeStructureResponseDto[]> {
  return unwrapApiResult<FeeStructureResponseDto[]>(
    await apiClient.GET("/api/v1/billing/fee-structures", { params: { query: { academicYearId, classId } } }),
  );
}

export async function getFeeStructure(id: string): Promise<FeeStructureResponseDto> {
  return unwrapApiResult<FeeStructureResponseDto>(
    await apiClient.GET("/api/v1/billing/fee-structures/{id}", { params: { path: { id } } }),
  );
}

export async function createFeeStructure(dto: CreateFeeStructureDto): Promise<FeeStructureResponseDto> {
  return unwrapApiResult<FeeStructureResponseDto>(await apiClient.POST("/api/v1/billing/fee-structures", { body: dto }));
}

export async function listFeeStructureLines(id: string): Promise<FeeStructureLineResponseDto[]> {
  return unwrapApiResult<FeeStructureLineResponseDto[]>(
    await apiClient.GET("/api/v1/billing/fee-structures/{id}/lines", { params: { path: { id } } }),
  );
}

export async function addFeeStructureLine(id: string, dto: CreateFeeStructureLineDto): Promise<FeeStructureLineResponseDto> {
  return unwrapApiResult<FeeStructureLineResponseDto>(
    await apiClient.POST("/api/v1/billing/fee-structures/{id}/lines", { params: { path: { id } }, body: dto }),
  );
}

export async function updateFeeStructureLine(lineId: string, dto: UpdateFeeStructureLineDto): Promise<FeeStructureLineResponseDto> {
  return unwrapApiResult<FeeStructureLineResponseDto>(
    await apiClient.POST("/api/v1/billing/fee-structures/lines/{lineId}", { params: { path: { lineId } }, body: dto }),
  );
}

export async function publishFeeStructure(id: string): Promise<FeeStructureResponseDto> {
  return unwrapApiResult<FeeStructureResponseDto>(
    await apiClient.POST("/api/v1/billing/fee-structures/{id}/publish", { params: { path: { id } } }),
  );
}

/** Real `204`, no body — blocked with a `409` (naming the real invoice count) if any invoice still references this structure (`FeeStructuresService.delete()`). */
export async function deleteFeeStructure(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/billing/fee-structures/{id}", { params: { path: { id } } });
  unwrapApiResult<void>(result);
}
