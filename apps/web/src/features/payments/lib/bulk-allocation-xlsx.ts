import * as XLSX from "xlsx";

/**
 * Phase 6 Slice 6 — real `.xlsx` template generation + parsing for bulk
 * allocation, following the exact SHAPE
 * `features/students/lib/bulk-import-xlsx.ts` established (the plan's own
 * explicit instruction: "a template for the upload -> preview -> results UX
 * SHAPE only... write NEW parsing logic"), but genuinely new columns —
 * `admissionNo` + `amount` only, not student demographic data. `xlsx`
 * (SheetJS) is already a real dependency of this monorepo (added by that
 * earlier pass), reused here, not re-added.
 */

export const TEMPLATE_HEADERS = ["admissionNo", "amount"] as const;
export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

/** A raw, unvalidated row as parsed straight from the spreadsheet — every cell as a string (or empty string if blank/absent). */
export type RawBulkAllocationRow = Record<TemplateHeader, string>;

export function downloadBulkAllocationTemplate(): void {
  const exampleRow: RawBulkAllocationRow = { admissionNo: "ADM-0001", amount: "5000.00" };
  const noteRow: Partial<Record<TemplateHeader, string>> = {
    admissionNo: "(delete this row — one line per payment; the same admissionNo may repeat across multiple lines)",
  };

  const worksheet = XLSX.utils.json_to_sheet([exampleRow, noteRow], { header: [...TEMPLATE_HEADERS] });
  worksheet["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 16) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Bulk Allocation");
  XLSX.writeFile(workbook, "klickit-bulk-allocation-template.xlsx");
}

/** Parses the first sheet of an uploaded `.xlsx`/`.xls` file into raw string rows. Throws a plain `Error` on anything unreadable — the caller maps that to a user-facing message, never lets it propagate as an unhandled rejection (same convention `parseStudentImportFile()` establishes). */
export async function parseBulkAllocationFile(file: File): Promise<RawBulkAllocationRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("No sheets found in this file.");
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows.map((row) => {
    const normalized = {} as RawBulkAllocationRow;
    for (const header of TEMPLATE_HEADERS) {
      const value = row[header];
      normalized[header] = value === undefined || value === null ? "" : String(value).trim();
    }
    return normalized;
  });
}
