import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BankStatementImportEntity } from "../domain/bank-statement-import.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import { BankStatementImportRepository } from "../infrastructure/bank-statement-import.repository";
import { BankStatementLineRepository } from "../infrastructure/bank-statement-line.repository";

export type DebitCreditConvention = "SEPARATE_COLUMNS" | "SIGNED_AMOUNT";

/**
 * Per-bank saved column->field mapping (FR-BANK-003.1). `columnMap`'s keys
 * are this system's own field names; their VALUES are the raw column
 * headers/keys found in `rawRows` (each row a flat `Record<string,
 * unknown>` — the caller is responsible for turning a CSV/XLSX file into
 * that shape before calling `importLines()`, out of this service's own
 * scope). `debit`/`credit` are used together only when
 * `debitCreditConvention='SEPARATE_COLUMNS'`; `amount` is used only when
 * `debitCreditConvention='SIGNED_AMOUNT'` (a single signed column — positive
 * = money in/debit, negative = money out/credit, matching this codebase's
 * own bank-statement-line convention: `debit` increases the bank's own
 * asset balance, `credit` decreases it, the SAME convention
 * `ReconciliationService`'s matching engine relies on when comparing a
 * statement line's net signed amount against a `gl_journal_line`'s).
 * `ref` is optional (not every bank statement export carries a reference
 * column).
 */
export interface BankStatementColumnMap {
  date: string;
  description: string;
  debit?: string;
  credit?: string;
  amount?: string;
  ref?: string;
}

/**
 * `dateFormat` is a token template built from `YYYY`/`MM`/`DD` separated by
 * any non-digit character(s) (e.g. `"YYYY-MM-DD"`, `"DD/MM/YYYY"`,
 * `"MM/DD/YYYY"`) — `parseStatementDate()` below splits both the format and
 * the raw value on non-digit runs and maps the resulting parts positionally,
 * deliberately not a full strptime-style grammar (this codebase's own
 * "small, honest parser, not a half-implemented general one" precedent, see
 * `RecurringService.computeNextRunOn()`'s cron-field evaluator).
 */
export interface BankStatementMappingTemplate {
  columnMap: BankStatementColumnMap;
  dateFormat: string;
  debitCreditConvention: DebitCreditConvention;
}

export interface ImportBankStatementLinesInput {
  accountId: string;
  fileId: string;
  mappingTemplate: BankStatementMappingTemplate;
  rawRows: ReadonlyArray<Record<string, unknown>>;
}

export interface ImportBankStatementLinesResult {
  import: BankStatementImportEntity;
  insertedCount: number;
  duplicateCount: number;
}

interface ParsedLine {
  lineDate: string;
  description: string;
  debit: Money;
  credit: Money;
  externalRef: string | null;
  dedupeHash: string;
}

/**
 * FR-BANK-003.1 — bank statement import with per-bank saved mapping
 * templates and dedupe-on-reimport (BR-BANK-02's own `uq_bank_stmt_line_dedupe`
 * backstop). `dedupe_hash = SHA-256(accountId|lineDate|signedAmount|ref)`,
 * computed with Node's built-in `node:crypto` `createHash("sha256")` — the
 * same primitive `shared/audit/audit-hash.util.ts`'s `computeHash()` uses
 * (that file's own canonical-JSON serialization isn't needed here, since
 * this hash has exactly four scalar fields with no nested/ordering
 * ambiguity — a plain pipe-delimited string is deterministic enough).
 *
 * `importLines()` computes every line's hash and checks-then-skips existing
 * duplicates (`findByAccountAndDedupeHash()`) BEFORE creating the
 * `bank_statement_import` row, so `line_count`/`duplicate_count` are known
 * up front and the import row is written exactly once with its final
 * counts — `bank_statement_import` is `BaseEntity` (append-only, no
 * `save()` exposed by its repository), so counts cannot be patched in after
 * the fact.
 */
@Injectable()
export class BankStatementImportService {
  constructor(
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly statementImportRepository: BankStatementImportRepository,
    private readonly statementLineRepository: BankStatementLineRepository,
  ) {}

  async importLines(
    em: EntityManager,
    input: ImportBankStatementLinesInput,
  ): Promise<ImportBankStatementLinesResult> {
    await this.bankAccountRepository.findByIdOrFail(input.accountId, em);

    const parsedLines = input.rawRows.map((row) => this.parseRow(input.accountId, row, input.mappingTemplate));

    const toInsert: ParsedLine[] = [];
    let duplicateCount = 0;
    for (const line of parsedLines) {
      const existing = await this.statementLineRepository.findByAccountAndDedupeHash(
        input.accountId,
        line.dedupeHash,
        em,
      );
      if (existing) {
        duplicateCount += 1;
      } else {
        toInsert.push(line);
      }
    }

    const importRow = await this.statementImportRepository.create(
      {
        accountId: input.accountId,
        fileId: input.fileId,
        mappingTemplate: input.mappingTemplate as unknown as Record<string, unknown>,
        importedAt: new Date(),
        lineCount: toInsert.length,
        duplicateCount,
      },
      em,
    );

    for (const line of toInsert) {
      await this.statementLineRepository.create(
        {
          importId: importRow.id,
          accountId: input.accountId,
          lineDate: line.lineDate,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
          externalRef: line.externalRef,
          dedupeHash: line.dedupeHash,
          reconState: "UNMATCHED",
        },
        em,
      );
    }

    return { import: importRow, insertedCount: toInsert.length, duplicateCount };
  }

  async findByIdOrFail(id: string): Promise<BankStatementImportEntity> {
    return this.statementImportRepository.findByIdOrFail(id);
  }

  async list(accountId?: string): Promise<BankStatementImportEntity[]> {
    return this.statementImportRepository.list(accountId ? { accountId } : {});
  }

  // ---- parsing --------------------------------------------------------

  private parseRow(
    accountId: string,
    row: Record<string, unknown>,
    template: BankStatementMappingTemplate,
  ): ParsedLine {
    const { columnMap, dateFormat, debitCreditConvention } = template;

    const rawDate = stringOrEmpty(row[columnMap.date]);
    const lineDate = parseStatementDate(rawDate, dateFormat);
    const description = stringOrEmpty(row[columnMap.description]);
    const { debit, credit } = this.parseAmounts(row, columnMap, debitCreditConvention);
    const externalRef = columnMap.ref ? nullableString(row[columnMap.ref]) : null;

    const signedAmount = debit.isZero() ? credit.negate() : debit;
    const dedupeHash = computeDedupeHash(accountId, lineDate, signedAmount, externalRef);

    return { lineDate, description, debit, credit, externalRef, dedupeHash };
  }

  private parseAmounts(
    row: Record<string, unknown>,
    columnMap: BankStatementColumnMap,
    convention: DebitCreditConvention,
  ): { debit: Money; credit: Money } {
    if (convention === "SEPARATE_COLUMNS") {
      if (!columnMap.debit || !columnMap.credit) {
        throw new ValidationException(
          "BankStatementImportService: debitCreditConvention=SEPARATE_COLUMNS requires columnMap.debit and columnMap.credit",
        );
      }
      const debit = parseOptionalMoney(row[columnMap.debit]);
      const credit = parseOptionalMoney(row[columnMap.credit]);
      return { debit, credit };
    }

    if (!columnMap.amount) {
      throw new ValidationException(
        "BankStatementImportService: debitCreditConvention=SIGNED_AMOUNT requires columnMap.amount",
      );
    }
    const amount = parseOptionalMoney(row[columnMap.amount]);
    return amount.isNegative() ? { debit: Money.ZERO, credit: amount.negate() } : { debit: amount, credit: Money.ZERO };
  }
}

/** SHA-256 over `accountId|lineDate|signedAmount|ref` — see class doc comment. */
function computeDedupeHash(accountId: string, lineDate: string, signedAmount: Money, ref: string | null): string {
  const canonical = `${accountId}|${lineDate}|${signedAmount.toDecimalString()}|${ref ?? ""}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Splits both `format` and `raw` on non-digit runs and maps positionally — see `BankStatementMappingTemplate.dateFormat`'s own doc comment. */
function parseStatementDate(raw: string, format: string): string {
  const tokens = format.match(/YYYY|MM|DD/g);
  if (!tokens || tokens.length === 0) {
    throw new ValidationException(
      `BankStatementImportService: unsupported dateFormat "${format}" — expected a combination of YYYY/MM/DD tokens`,
    );
  }
  const parts = raw.trim().split(/[^0-9]+/).filter((part) => part.length > 0);
  if (parts.length !== tokens.length) {
    throw new ValidationException(`BankStatementImportService: statement date "${raw}" does not match dateFormat "${format}"`);
  }

  const values: Record<string, string> = {};
  tokens.forEach((token, index) => {
    values[token] = parts[index];
  });

  const year = (values.YYYY ?? "").padStart(4, "0");
  const month = (values.MM ?? "01").padStart(2, "0");
  const day = (values.DD ?? "01").padStart(2, "0");
  if (year.length !== 4) {
    throw new ValidationException(`BankStatementImportService: statement date "${raw}" has no valid YYYY component for dateFormat "${format}"`);
  }
  return `${year}-${month}-${day}`;
}

function stringOrEmpty(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function parseOptionalMoney(value: unknown): Money {
  if (value === undefined || value === null) return Money.ZERO;
  const str = String(value).trim();
  if (str.length === 0) return Money.ZERO;
  return Money.fromDecimalString(str);
}
