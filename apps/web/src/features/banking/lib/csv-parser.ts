/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — a small,
 * hand-written, RFC4180-aware CSV parser. `StatementImportController`'s
 * `POST /banking/statement-imports` does NOT parse files server-side at all
 * (confirmed by reading `statement-import.controller.ts`/
 * `bank-statement-import.service.ts` directly — `importLines()` takes
 * `rawRows: Array<Record<string, unknown>>` as already-flat, already-parsed
 * input, its own doc comment states plainly "the caller is responsible for
 * turning a CSV/XLSX file into that shape before calling `importLines()`, out
 * of this service's own scope"). This module is that caller-side step for
 * this wizard — deliberately a SMALL parser, not a full CSV grammar or a
 * dependency on a library like `xlsx` (already used by
 * `features/students/lib/bulk-import-xlsx.ts`, but for real `.xlsx` binary
 * workbooks, a genuinely different problem from plain-text CSV) — matching
 * this codebase's own "small, honest parser, not a half-implemented general
 * one" precedent (`RecurringService.computeNextRunOn()`'s cron-field
 * evaluator, `BankStatementImportService.parseStatementDate()`'s own
 * YYYY/MM/DD token splitter).
 *
 * Handles the two RFC4180 rules that matter for real bank-statement exports:
 * a field wrapped in double quotes may contain commas and newlines verbatim,
 * and a literal double quote inside a quoted field is escaped by doubling it
 * (`""`). Does NOT attempt full RFC4180 (e.g. it doesn't enforce that quotes
 * only ever appear at a field boundary) — a deliberately narrow, honest scope
 * matching every other small parser in this codebase.
 *
 * `\r\n`, bare `\n`, and a leading UTF-8 BOM (common in bank-exported CSVs
 * saved from Excel) are all handled. A completely blank trailing line (the
 * common "file ends with a newline" case) is dropped rather than surfacing as
 * a phantom empty row.
 */

export interface ParsedCsv {
  /** The first row, trimmed — these become `rawRows`' own object keys, and `column-mapping-form.tsx`'s own dropdown option set. */
  headers: string[];
  /** Every subsequent row, keyed by `headers` — the exact `Array<Record<string, unknown>>` shape `ImportBankStatementLinesDto.rawRows` expects. A row shorter than `headers` fills missing trailing cells with `""`; a row longer than `headers` silently drops the extra trailing cells (an honest tradeoff for a small parser — a genuinely malformed file still round-trips without throwing, just with fewer columns filled). */
  rows: Array<Record<string, unknown>>;
}

/** One raw CSV record, before header-mapping — an array of cell strings in file order. */
function parseCsvRecords(text: string): string[][] {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyContent = false;

  const len = normalized.length;
  let i = 0;
  while (i < len) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      sawAnyContent = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      record.push(field);
      field = "";
      sawAnyContent = true;
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      sawAnyContent = false;
      i += 1;
      continue;
    }
    field += char;
    if (field.trim().length > 0) sawAnyContent = true;
    i += 1;
  }

  // Final record if the file doesn't end with a trailing newline.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  } else if (sawAnyContent) {
    // Defensive — reachable only for pathological input; every real path above already pushes.
    records.push(record);
  }

  // Drop fully-blank records (a lone `[""]`) — the trailing-newline case, not a real data row.
  return records.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Parses `text` (an already-read CSV file's full contents) into a header row + `Array<Record<string,unknown>>` data rows — see this file's own doc comment for exact scope/quoting rules. */
export function parseCsv(text: string): ParsedCsv {
  const records = parseCsvRecords(text);
  if (records.length === 0) return { headers: [], rows: [] };

  const [headerRecord, ...dataRecords] = records;
  const headers = headerRecord.map((h) => h.trim());

  const rows = dataRecords.map((record) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = record[index] ?? "";
    });
    return row;
  });

  return { headers, rows };
}
