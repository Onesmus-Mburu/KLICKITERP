import type { ContractResponseDto, CreateContractDto, UpdateContractDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — thin wrapper over
 * `ContractsController` (`packages/server/src/domains/procurement/api/contracts.controller.ts`,
 * base `/api/v1/procurement/contracts`). Every route — including every
 * GET — is gated by ONE bundled `procurement:contract:manage` permission
 * (confirmed by reading the controller directly, 112 lines; no separate view
 * permission exists), the same "one permission covers list/detail/mutate"
 * shape Quotations/POs/GRN/Supplier Invoices already established. No
 * DRAFT/approval workflow exists for this entity at all — `create()` sets
 * `status='ACTIVE'` directly, and `terminate()`/`markExpired()` are the only
 * 2 status transitions, both ACTIVE-only and both terminal — closer in shape
 * to `suppliers.api.ts` (Part 1) than any approval-gated file in this
 * feature folder.
 *
 * **The one real request-body codegen gap in this file, the same
 * `@ApiPropertyOptional({default: ...})`-forces-required class every prior
 * part has hit**: `CreateContractDto.renewalAlertDays` degrades to a
 * required (non-optional) `number` in the generated request-body type,
 * because `contract.dto.ts`'s own `@ApiPropertyOptional({ default: 30 })`
 * decorator carries a Swagger `default` — even though the real,
 * zod-inferred `CreateContractDto.renewalAlertDays?: number` (and the real
 * class-validator DTO, `@IsOptional() @IsInt() @Min(0)`) correctly mark it
 * optional. Fixed the identical way `suppliers.api.ts`'s own
 * `CreateSupplierRequestBody` already established: `createContract()`'s own
 * local `CreateContractRequestBody` interface mirrors the GENERATED (gapped)
 * shape (`renewalAlertDays: number`, required) so it stays assignable to
 * what `apiClient.POST` expects; the `dto as unknown as
 * CreateContractRequestBody` cast bridges the real (correctly-optional)
 * `dto` value to that gapped-but-call-site-compatible shape (confirmed
 * correct via a real `pnpm --filter web exec tsc --noEmit` run, not
 * assumed). **`UpdateContractDto`'s generated request-body shape has ZERO
 * gaps** (every field, including its OWN `renewalAlertDays`, stays correctly
 * optional — no Swagger `default` on `UpdateContractDto`'s own
 * `@ApiPropertyOptional()`, confirmed by reading `contract.dto.ts` directly)
 * — `updateContract()` passes its `dto` straight through with no cast,
 * matching `updateSupplier()`'s own "zero request-body gaps" precedent.
 *
 * **Response-side fields have no gap** — `@klickit/contracts`'s zod-inferred
 * `ContractResponseDto` (the type this file actually imports, per
 * `purchase-orders.api.ts`'s own doc comment on why the zod-inferred type
 * wins over the nested-under-`components` openapi one) already types
 * `value`/`documentFileId` as `string | null` correctly — the RAW generated
 * type degrades `documentFileId` to the usual `Record<string, never> | null`
 * (the standard `@ApiProperty({nullable: true})`-without-`type:String`
 * reflection gap `api-error.ts` already documents), but that's never the
 * type actually bound here. No `Date`-vs-string gap either —
 * `startsOn`/`endsOn` are plain `@ApiProperty() startsOn!: string;` (the
 * entity stores them as `date` columns), confirmed against both the DTO and
 * the zod mirror (`z.string()`, no `z.coerce.date()`) directly.
 *
 * **Two real query-param gaps, the same standing class every prior part has
 * found, PLUS one new instance on `expiring-soon`**:
 * `ContractsController_list`'s generated query-param type requires BOTH
 * `status` and `supplierId` as plain `string`s, even though the real
 * controller (`@Query("status") status?: ProcContractStatus, @Query("supplierId")
 * supplierId?: string`) treats both as genuinely optional — fixed the usual
 * way (conditional query-object construction). **`ContractsController_expiringSoon`'s
 * `withinDays` is ALSO generated as a required `string`**, even though the
 * real controller (`@Query("withinDays") withinDays?: string`) treats it as
 * genuinely optional (and `ContractsService.listExpiringSoon()`'s own
 * per-contract-default behavior — see `listContractsExpiringSoon()`'s own
 * doc comment — depends entirely on this being omittable) — fixed the same
 * conditional way, not a new class of gap, just a new instance of the
 * already-standard one.
 */
export const CONTRACT_STATUSES = ["ACTIVE", "EXPIRED", "TERMINATED"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

interface ContractsListQueryShape {
  status?: string;
  supplierId?: string;
}

export interface ListContractsFilters {
  status?: ContractStatus;
  supplierId?: string;
}

export async function listContracts(filters: ListContractsFilters = {}): Promise<ContractResponseDto[]> {
  const query: ContractsListQueryShape = {};
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.supplierId !== undefined) query.supplierId = filters.supplierId;
  return unwrapApiResult<ContractResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/contracts", {
      params: { query: query as unknown as Required<ContractsListQueryShape> },
    }),
  );
}

interface ExpiringSoonQueryShape {
  withinDays?: string;
}

/**
 * ACTIVE contracts whose `endsOn` falls within their own `renewalAlertDays`
 * of today. `withinDays` OMITTED entirely (not `undefined`-vs-`0` padded) is
 * what selects `ContractsService.listExpiringSoon()`'s own per-contract
 * default branch — every contract judged against its OWN configured alert
 * window, not one uniform threshold. Passing a real `withinDays` switches to
 * the uniform-threshold branch instead (every ACTIVE contract checked
 * against that one value, regardless of its own `renewalAlertDays`).
 */
export async function listContractsExpiringSoon(withinDays?: number): Promise<ContractResponseDto[]> {
  const query: ExpiringSoonQueryShape = {};
  if (withinDays !== undefined) query.withinDays = String(withinDays);
  return unwrapApiResult<ContractResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/contracts/expiring-soon", {
      params: { query: query as unknown as Required<ExpiringSoonQueryShape> },
    }),
  );
}

export async function getContract(id: string): Promise<ContractResponseDto> {
  return unwrapApiResult<ContractResponseDto>(
    await apiClient.GET("/api/v1/procurement/contracts/{id}", { params: { path: { id } } }),
  );
}

/** Mirrors `CreateContractDto`'s GENERATED (gapped) shape: `renewalAlertDays` required (not optional) — see this file's own doc comment above. */
interface CreateContractRequestBody {
  supplierId: string;
  title: string;
  startsOn: string;
  endsOn: string;
  value?: string | null;
  renewalAlertDays: number;
  documentFileId?: string | null;
}

/** Creates `status='ACTIVE'` directly — no DRAFT/approval workflow exists for this entity at all. */
export async function createContract(dto: CreateContractDto): Promise<ContractResponseDto> {
  return unwrapApiResult<ContractResponseDto>(
    await apiClient.POST("/api/v1/procurement/contracts", { body: dto as unknown as CreateContractRequestBody }),
  );
}

export async function updateContract(id: string, dto: UpdateContractDto): Promise<ContractResponseDto> {
  return unwrapApiResult<ContractResponseDto>(
    await apiClient.PATCH("/api/v1/procurement/contracts/{id}", { params: { path: { id } }, body: dto }),
  );
}

/** ACTIVE -> TERMINATED (early, deliberate end). Terminal — no path back to ACTIVE. */
export async function terminateContract(id: string): Promise<ContractResponseDto> {
  return unwrapApiResult<ContractResponseDto>(
    await apiClient.POST("/api/v1/procurement/contracts/{id}/terminate", { params: { path: { id } } }),
  );
}

/** ACTIVE -> EXPIRED (natural end-of-term). Terminal — no path back to ACTIVE. */
export async function markContractExpired(id: string): Promise<ContractResponseDto> {
  return unwrapApiResult<ContractResponseDto>(
    await apiClient.POST("/api/v1/procurement/contracts/{id}/mark-expired", { params: { path: { id } } }),
  );
}
