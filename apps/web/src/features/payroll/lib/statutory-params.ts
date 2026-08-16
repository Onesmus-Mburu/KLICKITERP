/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — the 4 real, seeded
 * `pyrl_statutory_table.params` jsonb shapes, mirrored word-for-word from
 * `StatutoryCalculationService`'s own documented interfaces
 * (`packages/server/src/domains/payroll/application/statutory-calculation.service.ts:20-84`),
 * since that engine's own arithmetic depends on these exact field names
 * existing — confirmed directly against the real seed rows
 * (`packages/server/src/migrations/0900-seed-permissions-and-roles.ts:504-533`),
 * not guessed.
 *
 * **Every rate field here (`rate`, `tier1.rate`, `tier2.rate`,
 * `employeeRate`, `employerRate`) is a plain JS NUMBER, stored as the real
 * decimal FRACTION** (e.g. `0.06` for NSSF's 6%) — genuinely different from
 * `lib/percent.ts`'s own decimal-STRING percent<->fraction conversion for
 * `StructureComponentLineDto.rate` (Part 2): that field is a validated
 * decimal STRING on a completely different table
 * (`pyrl_structure_component`). This part's own task brief explicitly calls
 * building a second string-shift conversion routine, for a different
 * underlying type, unnecessary risk for a real production
 * payroll-affecting figure — every form in this feature shows/edits the real
 * stored fraction directly (plain `<input type="number">`-backed React
 * state), with inline copy stating "as a decimal fraction, e.g. 0.06 for 6%"
 * next to every rate field, rather than a second conversion routine.
 *
 * `params` itself is opaque jsonb server-side — `CreatePyrlStatutoryTableDto.params`/
 * `UpdatePyrlStatutoryTableDto.params` are only ever `@IsObject()` (no nested
 * shape validated at the DTO level, confirmed by reading
 * `statutory-table.dto.ts` directly), so a real row's `params` could in
 * principle NOT match its own `kind`'s documented shape. The `as*Params()`
 * guards below let `statutory-table-params-view.tsx`/`statutory-params-form.tsx`
 * degrade to a raw-JSON fallback instead of crashing on `undefined` field
 * access, rather than assuming every row is well-formed.
 */
export interface PayeBand {
  min: number;
  max: number | null;
  rate: number;
}
export interface PayeParams {
  bands: PayeBand[];
  personalReliefMonthly: number;
}

export interface NssfParams {
  tier1: { upperLimit: number; rate: number };
  tier2: { lowerLimit: number; upperLimit: number; rate: number };
}

export interface ShifParams {
  rate: number;
  minimumAmount?: number;
}

export interface AhlParams {
  employeeRate: number;
  employerRate: number;
}

export const PYRL_STATUTORY_KINDS = ["PAYE", "NSSF", "SHIF", "AHL"] as const;
export type PyrlStatutoryKind = (typeof PYRL_STATUTORY_KINDS)[number];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function asPayeParams(params: Record<string, unknown>): PayeParams | null {
  const bands = params.bands;
  const relief = params.personalReliefMonthly;
  if (!Array.isArray(bands) || bands.length === 0 || !isFiniteNumber(relief)) return null;
  const parsedBands: PayeBand[] = [];
  for (const raw of bands) {
    if (!raw || typeof raw !== "object") return null;
    const b = raw as Record<string, unknown>;
    if (!isFiniteNumber(b.min) || !isFiniteNumber(b.rate)) return null;
    if (b.max !== null && !isFiniteNumber(b.max)) return null;
    parsedBands.push({ min: b.min, max: b.max === null ? null : (b.max as number), rate: b.rate });
  }
  return { bands: parsedBands, personalReliefMonthly: relief };
}

export function asNssfParams(params: Record<string, unknown>): NssfParams | null {
  const tier1 = params.tier1 as Record<string, unknown> | undefined;
  const tier2 = params.tier2 as Record<string, unknown> | undefined;
  if (!tier1 || typeof tier1 !== "object" || !tier2 || typeof tier2 !== "object") return null;
  if (!isFiniteNumber(tier1.upperLimit) || !isFiniteNumber(tier1.rate)) return null;
  if (!isFiniteNumber(tier2.lowerLimit) || !isFiniteNumber(tier2.upperLimit) || !isFiniteNumber(tier2.rate)) return null;
  return {
    tier1: { upperLimit: tier1.upperLimit, rate: tier1.rate },
    tier2: { lowerLimit: tier2.lowerLimit, upperLimit: tier2.upperLimit, rate: tier2.rate },
  };
}

export function asShifParams(params: Record<string, unknown>): ShifParams | null {
  if (!isFiniteNumber(params.rate)) return null;
  const minimumAmount = params.minimumAmount;
  if (minimumAmount !== undefined && !isFiniteNumber(minimumAmount)) return null;
  return minimumAmount === undefined ? { rate: params.rate } : { rate: params.rate, minimumAmount };
}

export function asAhlParams(params: Record<string, unknown>): AhlParams | null {
  if (!isFiniteNumber(params.employeeRate) || !isFiniteNumber(params.employerRate)) return null;
  return { employeeRate: params.employeeRate, employerRate: params.employerRate };
}

/** A real-shaped (not empty `{}`) starting point for a fresh create-dialog form — so a user picking e.g. PAYE immediately sees one editable band row, not nothing to work with. */
export function defaultParamsForKind(kind: PyrlStatutoryKind): Record<string, unknown> {
  switch (kind) {
    case "PAYE": {
      const params: PayeParams = { bands: [{ min: 0, max: null, rate: 0 }], personalReliefMonthly: 0 };
      return params as unknown as Record<string, unknown>;
    }
    case "NSSF": {
      const params: NssfParams = { tier1: { upperLimit: 0, rate: 0 }, tier2: { lowerLimit: 0, upperLimit: 0, rate: 0 } };
      return params as unknown as Record<string, unknown>;
    }
    case "SHIF": {
      const params: ShifParams = { rate: 0 };
      return params as unknown as Record<string, unknown>;
    }
    case "AHL": {
      const params: AhlParams = { employeeRate: 0, employerRate: 0 };
      return params as unknown as Record<string, unknown>;
    }
  }
}
