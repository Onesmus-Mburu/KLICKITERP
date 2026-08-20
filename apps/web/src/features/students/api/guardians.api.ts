import type { CreateGuardianResponseDto, GuardianListItemResponseDto, GuardianResponseDto, CreateGuardianDto, LinkGuardianDto, StudentGuardianLinkResponseDto, UpdateGuardianDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `GuardiansController`
 * (`packages/server/src/domains/students/api/guardians.controller.ts`).
 * Real gap this file works around at the CALLER level (see
 * `features/students/hooks/use-guardians.ts`), not here:
 * `GuardiansController_listForStudent` returns only link rows
 * (`{id, studentId, guardianId, relationship, isPrimary, receivesBilling}` —
 * no guardian name/phone/email), so a student's guardian section needs a
 * separate bulk `listGuardians()` fetch joined client-side against the link
 * rows by `guardianId`. Both `listForStudent` and `listGuardians` are
 * unpaginated bare arrays (no pagination anywhere in Module 8, confirmed
 * against every controller in this domain) — this file exposes exactly what
 * the controllers expose, no invented pagination.
 *
 * Standalone Parents page — `GuardianListItemResponseDto` (a superset of
 * `GuardianResponseDto`, additive `studentCount` field only
 * `GuardiansController.list()` populates — see that controller's own doc
 * comment) is used directly as this call's return type, matching every
 * existing caller of `listGuardians()` unaffected (they only ever read the
 * base `GuardianResponseDto` fields, ignoring the new one structurally).
 */
export async function listGuardians(): Promise<GuardianListItemResponseDto[]> {
  return unwrapApiResult<GuardianListItemResponseDto[]>(await apiClient.GET("/api/v1/students/guardians"));
}

/**
 * Phase 6 Slice 2c — sibling guardian dedup. `POST /students/guardians` now
 * finds-and-reuses an existing guardian (matched by phone, then email)
 * instead of erroring or silently duplicating — `wasExisting` (additive on
 * `GuardianResponseDto`'s own fields, see `CreateGuardianResponseDto`) tells
 * the caller which happened.
 */
export async function createGuardian(dto: CreateGuardianDto): Promise<CreateGuardianResponseDto> {
  return unwrapApiResult<CreateGuardianResponseDto>(await apiClient.POST("/api/v1/students/guardians", { body: dto }));
}

export async function listGuardianLinksForStudent(studentId: string): Promise<StudentGuardianLinkResponseDto[]> {
  return unwrapApiResult<StudentGuardianLinkResponseDto[]>(
    await apiClient.GET("/api/v1/students/{studentId}/guardians", { params: { path: { studentId } } }),
  );
}

/** Standalone Parents page — single guardian fetch, for the detail route. */
export async function getGuardian(id: string): Promise<GuardianResponseDto> {
  return unwrapApiResult<GuardianResponseDto>(await apiClient.GET("/api/v1/students/guardians/{id}", { params: { path: { id } } }));
}

/** `phone` is deliberately absent from `UpdateGuardianDto` — confirmed by reading it directly, not assumed — so it can never be changed via this call once a guardian is created; `fullName`/`email`/`nationalId`/`userId` are the only patchable fields. */
export async function updateGuardian(id: string, dto: UpdateGuardianDto): Promise<GuardianResponseDto> {
  return unwrapApiResult<GuardianResponseDto>(
    await apiClient.PATCH("/api/v1/students/guardians/{id}", { params: { path: { id } }, body: dto }),
  );
}

/** The reverse of `listGuardianLinksForStudent()` — which students this guardian is linked to. New route added alongside this Parents page (`GuardiansController.listForGuardian()`, `GET /students/guardians/{id}/students`) — `listByGuardian()` already existed on the repository but had no controller route exposing it before. */
export async function listStudentLinksForGuardian(guardianId: string): Promise<StudentGuardianLinkResponseDto[]> {
  return unwrapApiResult<StudentGuardianLinkResponseDto[]>(
    await apiClient.GET("/api/v1/students/guardians/{id}/students", { params: { path: { id: guardianId } } }),
  );
}

/**
 * Also used to UPDATE link attributes (relationship/isPrimary/receivesBilling)
 * of an existing link — `GuardiansService.linkToStudent()` upserts, see its
 * own doc comment. `isPrimary`/`receivesBilling` are optional in the real
 * zod `LinkGuardianDtoSchema` (`GuardiansController.link()` itself defaults
 * them: `dto.isPrimary ?? false`, `dto.receivesBilling ?? true`), but the
 * generated OpenAPI request-body type requires real booleans (not
 * `undefined`) — same class of codegen gap as `query-params.ts`'s
 * `optionalQuery` (an annotation-completeness gap, not a runtime
 * difference), so the same server-side defaults are applied here before the
 * request is sent, keeping behavior identical either way.
 */
export async function linkGuardianToStudent(studentId: string, dto: LinkGuardianDto): Promise<StudentGuardianLinkResponseDto> {
  return unwrapApiResult<StudentGuardianLinkResponseDto>(
    await apiClient.POST("/api/v1/students/{studentId}/guardians", {
      params: { path: { studentId } },
      body: { guardianId: dto.guardianId, relationship: dto.relationship, isPrimary: dto.isPrimary ?? false, receivesBilling: dto.receivesBilling ?? true },
    }),
  );
}

export async function unlinkGuardianFromStudent(studentId: string, guardianId: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/students/{studentId}/guardians/{guardianId}", {
    params: { path: { studentId, guardianId } },
  });
  unwrapApiResult<void>(result);
}
