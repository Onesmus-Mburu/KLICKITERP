import { buildCsv } from "../application/csv-export.util";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef } from "../application/report-registry.service";

const COLUMNS: ReportColumnDef[] = [
  { key: "name", label: "Name", type: "string" },
  { key: "amount", label: "Amount", type: "money" },
];

describe("buildCsv (RFC 4180 + UTF-8 BOM)", () => {
  it("prefixes the output with the UTF-8 byte-order-mark (EF BB BF)", () => {
    const buffer = buildCsv(COLUMNS, []);
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);
  });

  it("quotes a field containing a comma, doubling embedded quotes, and renders Money via toDecimalString()", () => {
    const buffer = buildCsv(COLUMNS, [{ name: 'Acme, "The" Supplier', amount: Money.fromDecimalString("1234.5") }]);
    const text = buffer.subarray(3).toString("utf8"); // drop the BOM before comparing text

    expect(text).toBe('Name,Amount\r\n"Acme, ""The"" Supplier",1234.5000\r\n');
  });

  it("quotes a field containing an embedded newline", () => {
    const buffer = buildCsv(COLUMNS, [{ name: "line1\nline2", amount: Money.ZERO }]);
    const text = buffer.subarray(3).toString("utf8");
    expect(text).toContain('"line1\nline2"');
  });

  it("renders null/undefined cells as empty strings and uses CRLF record separators", () => {
    const buffer = buildCsv(COLUMNS, [{ name: "Plain", amount: null }, { name: undefined, amount: Money.fromInt(5) }]);
    const text = buffer.subarray(3).toString("utf8");
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("Name,Amount");
    expect(lines[1]).toBe("Plain,");
    expect(lines[2]).toBe(",5.0000");
    expect(lines[3]).toBe(""); // trailing CRLF after the last record
  });

  it("drives column order/labels from the report's own columns[], not row key insertion order", () => {
    const reversedColumns: ReportColumnDef[] = [COLUMNS[1], COLUMNS[0]];
    const buffer = buildCsv(reversedColumns, [{ name: "X", amount: Money.fromInt(1) }]);
    const text = buffer.subarray(3).toString("utf8");
    expect(text.startsWith("Amount,Name\r\n1.0000,X\r\n")).toBe(true);
  });
});
