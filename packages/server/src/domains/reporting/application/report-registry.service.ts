import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";

/** The 4 primitive param types a report's `paramsShape` may declare (FR-RPT-001.1). */
export type ReportParamType = "string" | "number" | "date" | "uuid";

/** The 4 primitive column render types a report's `columns` may declare — `"money"` is distinct from `"number"` so a future export/CSV layer (Pass B) knows to format via `Money`, not a plain float. */
export type ReportColumnType = "string" | "number" | "money" | "date";

export interface ReportColumnDef {
  key: string;
  label: string;
  type: ReportColumnType;
}

/** Who is asking — every report's `execute()` receives this alongside its own params, even though NONE of PASS A's 7 reports currently perform their own permission check (that's `@RequirePermission(definition.permissionCode)` at the controller layer, a Pass B concern — see `reporting.module.ts`'s doc comment for why no `api/` folder exists yet). `permissions` is carried here regardless so a future report that needs a finer-grained, row-level check (e.g. "only this student's own guardian may run their statement") has somewhere to look without changing this interface. */
export interface ReportExecutionContext {
  userId: string;
  permissions: string[];
}

/**
 * The shape every report's `execute()` resolves to. `rows`/`totals` are
 * deliberately loosely typed (`Record<string, unknown>`, not a per-report
 * generic row type) — the registry/catalogue layer is generic over EVERY
 * report in the system, so it cannot know each report's concrete row shape;
 * each report class's own doc comment documents its row keys, and `columns`
 * (on `ReportDefinition`) is the machine-readable version of that contract a
 * future export/CSV layer (Pass B) will drive off of. `totals` is optional —
 * a raw detail listing (e.g. General Ledger) may have nothing meaningful to
 * total beyond what's already a `rows` aggregate elsewhere; when present, its
 * keys are report-specific too (documented per report, e.g. Trial Balance's
 * `{debit, credit, difference, balanced}`).
 */
export interface ReportResult {
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  generatedAt: Date;
}

/**
 * One entry in the report catalogue (FR-RPT-001.1: "Catalogue organized by
 * domain with per-report permission `reports:<code>:view`. Each report
 * definition: parameters schema, columns, totals, default sort, export
 * layouts"). PASS A implements `parameters schema` (`paramsShape`) and
 * `columns` literally; `totals` is a per-call `ReportResult` field, not a
 * static schema (a report's totals keys are fixed per report but their
 * VALUES are obviously per-execution, so there is nothing further to declare
 * statically beyond what each report's own doc comment already documents).
 * `default sort`/`export layouts` are explicitly OUT of PASS A's scope —
 * Pass B's export/CSV generation pass owns those; every PASS A report
 * already returns its rows in a sensible default order (documented per
 * report), which a future `defaultSort` field could formalize without
 * changing any report's actual query logic.
 *
 * `TParams` defaults to `Record<string, unknown>` so the registry can hold a
 * heterogeneous `Map<string, ReportDefinition<any>>` — each concrete report
 * class narrows it to its own params interface (e.g. `TrialBalanceParams`)
 * for its own callers/tests, same variance trade-off any plugin-style
 * registry in a statically-typed language has to accept.
 */
export interface ReportDefinition<TParams = Record<string, unknown>> {
  code: string;
  name: string;
  domain: string;
  permissionCode: string;
  paramsShape: Record<string, ReportParamType>;
  columns: ReportColumnDef[];
  execute(params: TParams, context: ReportExecutionContext): Promise<ReportResult>;
}

/**
 * The report catalogue itself (FR-RPT-001.1) — a simple in-memory registry,
 * `register()`/`get()`/`list()`, populated at module-init time.
 *
 * **Wiring pattern (documented per the task brief's own "your call, document
 * it" instruction)**: each of PASS A's 7 report classes is an ordinary
 * `@Injectable()` Nest provider that implements `ReportDefinition` directly
 * (its `code`/`name`/`domain`/`permissionCode`/`paramsShape`/`columns` are
 * readonly class properties, `execute()` a real method with its own
 * constructor-injected repository dependencies) — NOT a self-registering
 * constructor (a report class calling `registry.register(this)` from its own
 * constructor would run the registration as a side effect of Nest's DI
 * container merely INSTANTIATING the provider, before that provider's own
 * dependencies are guaranteed wired, and would silently re-register on every
 * test that does `new SomeReport(...)` without going through a real registry
 * — undesirable for unit testing individual reports in isolation, which the
 * task brief explicitly asks for). Instead, `ReportingModule` (the only place
 * that already knows the full concrete list of 7 report providers) implements
 * `OnModuleInit` and calls `registry.register(report)` once per report after
 * Nest's DI container has fully constructed every provider — a plain,
 * explicit "static array assembled in reporting.module.ts" per the task
 * brief's own second suggested option. This keeps `ReportRegistryService`
 * itself a small, dependency-free class (no constructor parameters at all)
 * that is trivially unit-testable with hand-built synthetic
 * `ReportDefinition` objects, entirely decoupled from the real reports'
 * own repository dependencies.
 */
@Injectable()
export class ReportRegistryService {
  private readonly definitions = new Map<string, ReportDefinition<unknown>>();

  /** Registers a report definition under its own `code`. Throws `ConflictException` on a duplicate `code` — a catalogue with two reports claiming the same code is a wiring bug, not a runtime condition to silently overwrite. */
  register<TParams>(definition: ReportDefinition<TParams>): void {
    if (this.definitions.has(definition.code)) {
      throw new ConflictException(`Report already registered: ${definition.code}`);
    }
    this.definitions.set(definition.code, definition as ReportDefinition<unknown>);
  }

  /** Throws `NotFoundException` for an unknown code — every caller (a future controller, a saved-params validator, an export job) needs a definite answer, never `undefined`. */
  get(code: string): ReportDefinition<unknown> {
    const definition = this.definitions.get(code);
    if (!definition) {
      throw new NotFoundException("ReportDefinition", code);
    }
    return definition;
  }

  /** Every registered report, domain then code — the "Catalogue organized by domain" shape FR-RPT-001.1 asks for. */
  list(): ReportDefinition<unknown>[] {
    return [...this.definitions.values()].sort((a, b) => {
      if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
      return a.code.localeCompare(b.code);
    });
  }
}
