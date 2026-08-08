import { CreateStudentDtoSchema, type ClassResponseDto, type CreateGuardianDto, type CreateStudentDto, type FeeGroupResponseDto, type LinkGuardianDto, type StreamResponseDto } from "@klickit/contracts";
import { listStreamsForClass } from "../api/streams.api";
import { STUDENT_BOARDING_KINDS } from "../constants";
import type { RawImportRow, TemplateHeader } from "./bulk-import-xlsx";

/**
 * Phase 6 Slice 2b item 5 — resolves a raw spreadsheet row (human-readable
 * class/stream/fee-group NAMES) against the already-fetched class/fee-group
 * lists (and a per-distinct-class stream fetch), then validates the
 * resulting candidate through the REAL `CreateStudentDtoSchema` (the same
 * zod schema `student-form.tsx`'s single-student create flow validates
 * against) rather than hand-rolling a separate set of checks, per the plan's
 * explicit instruction. Reasons are returned as structured
 * `{code, params}` pairs (not pre-rendered strings) so
 * `bulk-import-dialog.tsx` can translate them via `next-intl` — this module
 * is plain TS, not a React hook, so it can't call `useTranslations()` itself.
 *
 * Phase 6 Slice 2b follow-up:
 *  - `enrolledOn` is no longer read from the row at all — every resolved
 *    payload gets `todayIso()` (the real import-moment date), matching
 *    the removed template column.
 *  - `boarding`/`feeGroupName` are genuinely optional — a blank cell no
 *    longer produces a reason and is simply omitted from the payload
 *    (`boarding` defaults to `"DAY"` server-side; `feeGroupId` was already
 *    optional).
 *  - Up to 4 guardian blocks (Father/Mother/Guardian/Sponsor) are parsed
 *    per row — see `GUARDIAN_BLOCKS`'s own doc comment for the primary-
 *    guardian default judgment call.
 */
export type ImportRowReasonCode =
  | "unknownClass"
  | "unknownStream"
  | "unknownFeeGroup"
  | "missingRequiredField"
  | "invalidBoarding"
  | "guardianNameRequired"
  | "guardianContactRequired"
  | "schemaError";

export interface ImportRowReason {
  code: ImportRowReasonCode;
  params?: Record<string, string>;
}

export type GuardianRelationshipCode = "FATHER" | "MOTHER" | "GUARDIAN" | "SPONSOR";

/** One guardian to create+link after the row's student is created — see `bulk-import-dialog.tsx`'s `handleImport()`. */
export interface ResolvedGuardianBlock {
  relationship: GuardianRelationshipCode;
  guardianDto: CreateGuardianDto;
  linkDto: Omit<LinkGuardianDto, "guardianId">;
}

export interface ResolvedImportRow {
  rowNumber: number;
  raw: RawImportRow;
  valid: boolean;
  reasons: ImportRowReason[];
  payload?: CreateStudentDto;
  /** Guardians to create+link once this row's student exists — empty if no block was filled in. Only populated when the row is otherwise free of guardian-block errors (a block with a name-only or contact-only problem is reported via `reasons` instead and never reaches this array). */
  guardians: ResolvedGuardianBlock[];
  resolvedClassName?: string;
  resolvedStreamName?: string;
  resolvedFeeGroupName?: string;
}

function findByNameCaseInsensitive<T extends { name: string }>(list: readonly T[], name: string): T | undefined {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  return list.find((item) => item.name.trim().toLowerCase() === target);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface GuardianBlockDef {
  relationship: GuardianRelationshipCode;
  nameHeader: TemplateHeader;
  emailHeader: TemplateHeader;
  phoneHeader: TemplateHeader;
}

/**
 * Phase 6 Slice 2b follow-up item 1 — the 4 guardian-relationship blocks a
 * bulk-import row can carry, checked in this fixed Father -> Mother ->
 * Guardian -> Sponsor order. Relationship codes match the exact values
 * `guardian-fields.tsx`/`guardian-link-dialog.tsx` already submit
 * (`RELATIONSHIP_CODES` in both files) — reused verbatim, not reinvented.
 *
 * **Primary-guardian default — a deliberate, documented judgment call, not
 * an arbitrary one**: a single row can define up to 4 guardians, but
 * `LinkGuardianDto` only lets ONE be `isPrimary: true` per student
 * (`GuardiansService.linkToStudent()` silently demotes any previous primary
 * — confirmed live in Slice 2's own verification). A spreadsheet row gives
 * no other signal to rank guardians by, so the FIRST non-empty block in
 * this fixed order is defaulted to `isPrimary: true` and the rest to
 * `false` — Father-first mirrors this template's own column order (also
 * the order used throughout the rest of this codebase's relationship
 * dropdowns) and is a common "principal contact" convention for a school
 * roster. Stated here explicitly so it's easy to find/revisit, not a
 * silent default.
 */
const GUARDIAN_BLOCKS: GuardianBlockDef[] = [
  { relationship: "FATHER", nameHeader: "Father Name", emailHeader: "Father Email", phoneHeader: "Father Phone" },
  { relationship: "MOTHER", nameHeader: "Mother Name", emailHeader: "Mother Email", phoneHeader: "Mother Phone" },
  { relationship: "GUARDIAN", nameHeader: "Guardian Name", emailHeader: "Guardian Email", phoneHeader: "Guardian Phone" },
  { relationship: "SPONSOR", nameHeader: "Sponsor Name", emailHeader: "Sponsor Email", phoneHeader: "Sponsor Phone" },
];

/**
 * Parses the 4 guardian blocks for one row. Any reason pushed here (name
 * touched but blank, or neither phone nor email present — same
 * phone-or-email rule `hasGuardianContact()`/`GuardiansService.create()`
 * already establish elsewhere) makes the WHOLE row invalid, same as any
 * other reason — a guardian block with a name but no contact is exactly
 * the case the plan's verification asks to confirm gets flagged, not
 * silently dropped or silently passed.
 */
function resolveGuardianBlocks(raw: RawImportRow, reasons: ImportRowReason[]): ResolvedGuardianBlock[] {
  const guardians: ResolvedGuardianBlock[] = [];
  let primaryAssigned = false;

  for (const block of GUARDIAN_BLOCKS) {
    const name = raw[block.nameHeader].trim();
    const email = raw[block.emailHeader].trim();
    const phone = raw[block.phoneHeader].trim();
    const touched = !!(name || email || phone);
    if (!touched) continue;

    if (!name) {
      reasons.push({ code: "guardianNameRequired", params: { relationship: block.relationship } });
      continue;
    }
    if (!phone && !email) {
      reasons.push({ code: "guardianContactRequired", params: { relationship: block.relationship } });
      continue;
    }

    guardians.push({
      relationship: block.relationship,
      guardianDto: { fullName: name, phone: phone || undefined, email: email || undefined },
      linkDto: { relationship: block.relationship, isPrimary: !primaryAssigned, receivesBilling: true },
    });
    primaryAssigned = true;
  }

  return guardians;
}

export async function resolveImportRows(
  rawRows: RawImportRow[],
  classes: ClassResponseDto[],
  feeGroups: FeeGroupResponseDto[],
  admissionNoAutogenEnabled: boolean,
): Promise<ResolvedImportRow[]> {
  // Resolve every distinct referenced class name ONCE, then fetch its
  // streams ONCE (not once per row) — `GET /students/streams` requires
  // `?classId=` (no "list all streams" mode), so this is the minimum
  // number of extra HTTP calls: one per distinct class actually referenced
  // in the file, not one per row.
  const distinctClassIds = new Set<string>();
  for (const raw of rawRows) {
    const klass = findByNameCaseInsensitive(classes, raw.className);
    if (klass) distinctClassIds.add(klass.id);
  }
  const streamsByClassId = new Map<string, StreamResponseDto[]>();
  await Promise.all(
    Array.from(distinctClassIds).map(async (classId) => {
      try {
        streamsByClassId.set(classId, await listStreamsForClass(classId));
      } catch {
        streamsByClassId.set(classId, []);
      }
    }),
  );

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2; // header is row 1, data starts at row 2
    const reasons: ImportRowReason[] = [];

    const klass = raw.className ? findByNameCaseInsensitive(classes, raw.className) : undefined;
    if (!raw.className) reasons.push({ code: "missingRequiredField", params: { field: "className" } });
    else if (!klass) reasons.push({ code: "unknownClass", params: { name: raw.className } });

    let stream: StreamResponseDto | undefined;
    if (raw.streamName) {
      const streamsForClass = klass ? (streamsByClassId.get(klass.id) ?? []) : [];
      stream = findByNameCaseInsensitive(streamsForClass, raw.streamName);
      if (!stream) reasons.push({ code: "unknownStream", params: { name: raw.streamName, className: klass?.name ?? raw.className } });
    }

    let feeGroup: FeeGroupResponseDto | undefined;
    if (raw.feeGroupName) {
      feeGroup = findByNameCaseInsensitive(feeGroups, raw.feeGroupName);
      if (!feeGroup) reasons.push({ code: "unknownFeeGroup", params: { name: raw.feeGroupName } });
    }

    if (!raw.firstName) reasons.push({ code: "missingRequiredField", params: { field: "firstName" } });
    if (!raw.lastName) reasons.push({ code: "missingRequiredField", params: { field: "lastName" } });
    // `enrolledOn` is no longer a template column (Phase 6 Slice 2b
    // follow-up item 2) — it's always set below to today's real date, so
    // there is nothing to require from the row here.

    // Phase 6 Slice 2b follow-up items 3/4 — `boarding` is genuinely
    // optional now: a blank cell is simply omitted from the payload (the
    // server defaults it to "DAY", see `CreateStudentDto.boarding`'s
    // `.optional()` shape). A NON-blank cell that doesn't match a real
    // boarding kind is still a real error, same as before.
    const boardingRaw = raw.boarding.trim().toUpperCase();
    let boarding: "DAY" | "BOARDER" | undefined;
    if (boardingRaw) {
      if ((STUDENT_BOARDING_KINDS as readonly string[]).includes(boardingRaw)) {
        boarding = boardingRaw as "DAY" | "BOARDER";
      } else {
        reasons.push({ code: "invalidBoarding" });
      }
    }

    if (!raw.admissionNo && !admissionNoAutogenEnabled) {
      reasons.push({ code: "missingRequiredField", params: { field: "admissionNo" } });
    }

    // `feeGroupName` was already optional here (only checked/flagged when
    // non-blank, above) — confirmed, not changed by this follow-up.

    const guardians = resolveGuardianBlocks(raw, reasons);

    let payload: CreateStudentDto | undefined;
    if (reasons.length === 0 && klass) {
      const candidate: CreateStudentDto = {
        ...(raw.admissionNo ? { admissionNo: raw.admissionNo } : {}),
        firstName: raw.firstName,
        middleName: raw.middleName || undefined,
        lastName: raw.lastName,
        classId: klass.id,
        streamId: stream?.id,
        boarding,
        feeGroupId: feeGroup?.id,
        // Phase 6 Slice 2b follow-up item 2 — always today's real date,
        // never read from the spreadsheet (the column was removed).
        enrolledOn: todayIso(),
      };
      const parsed = CreateStudentDtoSchema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          reasons.push({ code: "schemaError", params: { field: issue.path.join("."), message: issue.message } });
        }
      } else {
        payload = parsed.data;
      }
    }

    return {
      rowNumber,
      raw,
      valid: reasons.length === 0 && !!payload,
      reasons,
      payload,
      guardians,
      resolvedClassName: klass?.name,
      resolvedStreamName: stream?.name,
      resolvedFeeGroupName: feeGroup?.name,
    };
  });
}
