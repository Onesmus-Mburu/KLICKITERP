import type { AddEmployeeComponentDto, EndEmployeeComponentDto, PyrlEmployeeComponentResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 22 Part 3 (Payroll, Module 15) — thin wrapper over
 * `EmployeeComponentsController`
 * (`packages/server/src/domains/payroll/api/employee-components.controller.ts`,
 * base `/api/v1/payroll/employee-components`, tag `payroll-employee-components`)
 * — a SINGLE shared `payroll:employee-component:manage` permission gates ALL
 * 4 routes. Every route here is genuinely scoped to one `employeeId` — same
 * "no global list" shape `employee-assignments.api.ts` documents.
 *
 * **CRITICAL semantic nuance, load-bearing for every caller of this file**:
 * despite the entity's own name ("employee component" / commonly described as
 * an "override"), a real payroll run does NOT let this replace a structure's
 * own line for the same component — `payroll-runs.service.ts:365-383` sums
 * BOTH the employee's structure lines AND their active employee-component
 * rows into the SAME `componentLines` array, with zero deduplication by
 * `componentId`. If an employee's structure has a `HOUSE_ALLOWANCE` line AND
 * they also hold an active employee-component row for `HOUSE_ALLOWANCE`, a
 * real run pays BOTH amounts. Every caller of this file (`employee-component-overrides-panel.tsx`
 * above all) must describe this as an ADDITIVE extra amount, never as an
 * "override"/"replacement" — see that panel's own doc comment for the full
 * warning copy this drives.
 *
 * **Zero request-body codegen gaps — checked directly, not assumed**:
 * `AddEmployeeComponentDtoSchema`/`EndEmployeeComponentDtoSchema` (the
 * zod-inferred types) both generate cleanly against
 * `AddEmployeeComponentDto`/`EndEmployeeComponentDto`
 * (`employee-component.dto.ts`) — no cast needed on either write function
 * below, same "clean codegen" story `employee-assignments.api.ts` documents.
 *
 * **One response-side gap, absorbed for free** — `PyrlEmployeeComponentResponseDto.effectiveTo`
 * degrades to `Record<string, never> | null` in the RAW generated
 * `openapi-types.ts` (same nullable-without-a-type-hint reflection gap
 * `employee-assignments.api.ts` documents for its own sibling DTO); the
 * zod-inferred type used directly below gets it right (`string | null`).
 *
 * **The no-overlap conflict is a clean `409`, scoped to `(employeeId,
 * componentId)`, NOT to the whole employee** — confirmed by reading
 * `EmployeeComponentsService.add()` directly: same `23P01`
 * exclusion_violation translation `employee-assignments.api.ts` documents,
 * but message text is genuinely different (verified by reading the service,
 * not assumed byte-identical to the assignment one): `` `pyrl_employee_component:
 * overlapping period for employee ${employeeId}/component ${componentId}` ``.
 * An employee CAN hold two DIFFERENT components concurrently (e.g. housing +
 * transport allowance) — only two overlapping ranges for the SAME component
 * conflict.
 *
 * **`endOverride()`'s body carries `componentId`** (unlike
 * `endEmployeeAssignment()`'s body, which is just `{effectiveTo}` — an
 * employee only ever has ONE open assignment at a time, but can hold several
 * concurrently open component overrides, so the caller must say which one to
 * close) — confirmed by reading `EndEmployeeComponentDto` directly.
 */
export async function listEmployeeComponents(employeeId: string): Promise<PyrlEmployeeComponentResponseDto[]> {
  return unwrapApiResult<PyrlEmployeeComponentResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/employee-components", { params: { query: { employeeId } } }),
  );
}

/** An ARRAY — unlike assignments' single-or-null, several different components can be concurrently active for one employee on the same date. */
export async function getActiveEmployeeComponents(employeeId: string, date: string): Promise<PyrlEmployeeComponentResponseDto[]> {
  return unwrapApiResult<PyrlEmployeeComponentResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/employee-components/active", { params: { query: { employeeId, date } } }),
  );
}

export async function addEmployeeComponent(dto: AddEmployeeComponentDto): Promise<PyrlEmployeeComponentResponseDto> {
  return unwrapApiResult<PyrlEmployeeComponentResponseDto>(await apiClient.POST("/api/v1/payroll/employee-components", { body: dto }));
}

/** Closes ONE specific open-ended override for `(employeeId, componentId)` — real `404` if none is open for that pair, confirmed by reading `endOverride()` directly. */
export async function endEmployeeComponent(employeeId: string, dto: EndEmployeeComponentDto): Promise<PyrlEmployeeComponentResponseDto> {
  return unwrapApiResult<PyrlEmployeeComponentResponseDto>(
    await apiClient.POST("/api/v1/payroll/employee-components/end", { params: { query: { employeeId } }, body: dto }),
  );
}
