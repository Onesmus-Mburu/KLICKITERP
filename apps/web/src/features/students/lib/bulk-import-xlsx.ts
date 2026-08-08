import * as XLSX from "xlsx";

/**
 * Phase 6 Slice 2b item 5 — real `.xlsx` template generation + parsing,
 * client-side only (`xlsx`/SheetJS, a genuinely new dependency — no
 * file-upload/download or spreadsheet precedent existed anywhere in
 * `apps/web` before this pass). Columns use human-readable class/stream/fee-group
 * NAMES (not UUIDs) — resolved against the already-fetched
 * `useClasses()`/`useFeeGroups()` lists (and a per-class `listStreamsForClass()`
 * call for any class name referenced in the file) by
 * `bulk-import-dialog.tsx`, not here — this module only knows about raw
 * spreadsheet rows, never HTTP.
 *
 * Phase 6 Slice 2b follow-up — three changes to the column set, all four of
 * template/parser/preview-validation/import-execution kept in agreement:
 *  1. **12 new guardian columns**, 4 relationship blocks (Father/Mother/
 *     Guardian/Sponsor) x 3 fields (Name/Email/Phone) each — deliberately
 *     given human-readable `"Father Name"`-style header strings (spaces,
 *     Title Case) rather than this file's usual camelCase convention, since
 *     they don't mirror a single `CreateStudentDto` field the way every
 *     other column does; block-parsing/validation lives in
 *     `bulk-import-resolve.ts`.
 *  2. **`enrolledOn` column REMOVED** — the student's `enrolledOn` is now
 *     always set to the real import-moment date client-side
 *     (`bulk-import-resolve.ts`), never read from the spreadsheet; no row
 *     needs to supply it, and no such column exists to fill in.
 *  3. `boarding`/`feeGroupName` stay as columns but are now genuinely
 *     optional to leave blank (see `bulk-import-resolve.ts`'s validation —
 *     a blank `boarding` cell defaults server-side to `"DAY"`, matching
 *     `CreateStudentDto.boarding`'s new `.optional()` shape).
 */

export const TEMPLATE_HEADERS = [
  "admissionNo",
  "firstName",
  "middleName",
  "lastName",
  "className",
  "streamName",
  "boarding",
  "feeGroupName",
  "Father Name",
  "Father Email",
  "Father Phone",
  "Mother Name",
  "Mother Email",
  "Mother Phone",
  "Guardian Name",
  "Guardian Email",
  "Guardian Phone",
  "Sponsor Name",
  "Sponsor Email",
  "Sponsor Phone",
] as const;

export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

/** A raw, unvalidated row as parsed straight from the spreadsheet — every cell as a string (or empty string if blank/absent), keyed by the SAME header names the template uses. */
export type RawImportRow = Record<TemplateHeader, string>;

/**
 * Generates and triggers a download of the real `.xlsx` template — a header
 * row plus one example row (clearly marked, meant to be replaced/deleted)
 * showing the expected format, including the notes that `admissionNo` may
 * be left blank when autogen is enabled, `boarding`/`feeGroupName` may be
 * left blank (defaults applied server-side/omitted), guardian columns are
 * all optional (fill in any subset of the 4 blocks, or none), and
 * `enrolledOn` is no longer a column at all — it's always set to today's
 * date automatically on import.
 */
export function downloadStudentImportTemplate(): void {
  const exampleRow: RawImportRow = {
    admissionNo: "ADM-0001",
    firstName: "Jane",
    middleName: "",
    lastName: "Doe",
    className: "Grade 5",
    streamName: "Blue",
    boarding: "DAY",
    feeGroupName: "",
    "Father Name": "John Doe",
    "Father Email": "john.doe@example.com",
    "Father Phone": "+254700000001",
    "Mother Name": "",
    "Mother Email": "",
    "Mother Phone": "",
    "Guardian Name": "",
    "Guardian Email": "",
    "Guardian Phone": "",
    "Sponsor Name": "",
    "Sponsor Email": "",
    "Sponsor Phone": "",
  };
  const noteRow: Partial<Record<TemplateHeader, string>> = {
    admissionNo:
      "(delete this row — admissionNo may be blank if autogen is enabled; boarding/feeGroupName/all guardian columns may be blank too; enrolledOn is set automatically to today's date, no column needed)",
  };

  const worksheet = XLSX.utils.json_to_sheet([exampleRow, noteRow], { header: [...TEMPLATE_HEADERS] });
  worksheet["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
  XLSX.writeFile(workbook, "klickit-student-import-template.xlsx");
}

/** Parses the first sheet of an uploaded `.xlsx`/`.xls` file into raw string rows. Throws a plain `Error` on anything unreadable — the caller (`bulk-import-dialog.tsx`) maps that to a user-facing `parseError` message, never lets it propagate as an unhandled rejection. */
export async function parseStudentImportFile(file: File): Promise<RawImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("No sheets found in this file.");
  }
  const sheet = workbook.Sheets[firstSheetName];
  // `defval: ""` so every declared column is always present as a string
  // (never `undefined`) even when a cell is blank — every downstream
  // consumer can treat every field uniformly.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows.map((row) => {
    const normalized = {} as RawImportRow;
    for (const header of TEMPLATE_HEADERS) {
      const value = row[header];
      normalized[header] = value === undefined || value === null ? "" : String(value).trim();
    }
    return normalized;
  });
}
