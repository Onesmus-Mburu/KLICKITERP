import { Money } from "../../../shared/money/money";
import { ReportColumnDef } from "./report-registry.service";

/** RFC 4180 §2.4/2.5/2.6: quote a field if it contains a comma, a double quote, or a line break; embedded double quotes are doubled. */
const NEEDS_QUOTING = /[",\r\n]/;

function stringifyCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Money) return value.toDecimalString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function escapeCsvField(value: unknown): string {
  const str = stringifyCsvValue(value);
  if (NEEDS_QUOTING.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Real, RFC 4180-conformant CSV generation for `ExportJobsService` (FR-RPT-003.1):
 *  - Fields are comma-separated, records CRLF-separated (RFC 4180 §2.1/2.2).
 *  - Any field containing a comma, a double quote, or an embedded CR/LF is
 *    wrapped in double quotes, with embedded double quotes doubled
 *    (`"` -> `""`) — §2.5/2.6/2.7.
 *  - `Money` cells render via `toDecimalString()` (never `toString()`
 *    incidentally relying on the same method — made explicit here so a
 *    future `Money` refactor can't silently change CSV output), `Date`
 *    cells render as ISO-8601.
 *  - A UTF-8 byte-order-mark (`EF BB BF`) is prepended — the de facto
 *    standard that makes Excel (and most spreadsheet tools) auto-detect
 *    UTF-8 rather than mis-decoding as the system's legacy codepage,
 *    explicitly required by FR-RPT-003.1.
 *
 * Column order/labels are driven entirely by the executing report's own
 * `ReportDefinition.columns` — the machine-readable column contract every
 * report already declares (see `ReportDefinition`'s own doc comment) —
 * rather than `Object.keys(row)`, so CSV column order is stable and
 * report-controlled even though `ReportResult.rows` is loosely typed
 * `Record<string, unknown>[]`.
 */
export function buildCsv(columns: ReportColumnDef[], rows: Record<string, unknown>[]): Buffer {
  const headerLine = columns.map((column) => escapeCsvField(column.label)).join(",");
  const dataLines = rows.map((row) => columns.map((column) => escapeCsvField(row[column.key])).join(","));
  const body = [headerLine, ...dataLines].join("\r\n") + "\r\n";

  const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
  return Buffer.concat([UTF8_BOM, Buffer.from(body, "utf8")]);
}
