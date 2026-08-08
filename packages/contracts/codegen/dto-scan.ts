/**
 * Source-level (TypeScript Compiler API) scan of every `*.dto.ts` file under
 * `packages/server/src`. This is the "ground truth" property list for each
 * DTO class — used two ways:
 *   1. By `generate-zod-schemas.ts` to resolve `@ValidateNested()` +
 *      `@Type(() => X)` nested-class references (class-transformer's `@Type`
 *      metadata is not stored in class-validator's `MetadataStorage`, so the
 *      only reliable way to know "this property nests class X" is to read it
 *      straight from the decorator's own source), to know each property's
 *      declared TS type text (used as the structural fallback when a
 *      property carries no class-validator decorators at all — very common
 *      on `*-response.dto.ts` read-model classes), and to know each
 *      property's own `?` optional-token (cross-checked against
 *      `@IsOptional()`).
 *   2. By `packages/contracts/src/__tests__/completeness.spec.ts` as the
 *      independent, re-derived list of "every DTO class + its own property
 *      names" that every generated zod schema is asserted against — this is
 *      what makes the completeness check real evidence instead of a manual
 *      eyeball claim: it does not trust the generator's own bookkeeping, it
 *      re-parses the DTO source files fresh.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

export interface ScannedDecorator {
  /** Decorator identifier, e.g. "IsString", "IsOptional", "Type", "ApiProperty". */
  name: string;
  /** Raw source text of the decorator's call arguments, e.g. `(120)`, `(() => JournalLineInputDto)`. */
  argsText: string;
  /** For `@Type(() => X)` / `@ValidateNested()` paired usage: the arrow-function-returned identifier, if any. */
  arrowReturnIdentifier?: string;
}

export interface ScannedProperty {
  name: string;
  /** Has a `?` token in its own declaration (`foo?: string`). */
  optionalToken: boolean;
  /** Raw source text of the type annotation, e.g. `string`, `JournalLineInputDto[]`, `"ACTIVE" | "SUSPENDED"`. */
  typeText: string;
  decorators: ScannedDecorator[];
}

export interface ScannedDtoClass {
  className: string;
  /** Absolute file path this class was found in. */
  filePath: string;
  /** Path relative to packages/server/src, e.g. "platform/users/api/dto/create-user.dto.ts". */
  relativePath: string;
  properties: ScannedProperty[];
  /** `extends X` base-class identifier, if any (e.g. `AccountTreeNodeResponseDto extends AccountResponseDto`). */
  extendsClassName?: string;
  /**
   * Named import specifiers this file declares, resolved to absolute .ts paths where the
   * specifier resolves to a local file (used to disambiguate `@Type(() => X)` references when
   * X is not declared in this same file — several DTO class names repeat across unrelated
   * modules, e.g. `CreateCategoryDto` exists in both domains/inventory and domains/expenses, so
   * a bare class-name lookup alone is ambiguous).
   */
  importedFrom: Map<string, string>;
}

const SERVER_SRC = path.resolve(__dirname, "../../server/src");

/** All `*.dto.ts` files under packages/server/src, wherever they live (dto/ folders, or not — e.g. shared/pagination/pagination.dto.ts). */
export function findAllDtoFiles(): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".dto.ts")) {
        out.push(full);
      }
    }
  }
  walk(SERVER_SRC);
  return out.sort();
}

function decoratorsOfNode(node: ts.Node): readonly ts.Decorator[] {
  const modifiers = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  return modifiers ?? [];
}

function scanDecorator(sourceFile: ts.SourceFile, decorator: ts.Decorator): ScannedDecorator {
  const expr = decorator.expression;
  let name = "";
  let argsText = "";
  let arrowReturnIdentifier: string | undefined;

  if (ts.isCallExpression(expr)) {
    name = expr.expression.getText(sourceFile);
    argsText = expr.arguments.map(a => a.getText(sourceFile)).join(", ");
    const first = expr.arguments[0];
    if (first && ts.isArrowFunction(first) && ts.isIdentifier(first.body)) {
      arrowReturnIdentifier = first.body.text;
    }
    // `() => [X]` array-wrapped type reference, e.g. some `@ApiProperty({ type: () => [X] })` style — not used by
    // @Type but kept generic in case a future DTO uses it for @Type(() => X) via a parenthesized array is rare;
    // handled here defensively.
    if (first && ts.isArrowFunction(first) && ts.isArrayLiteralExpression(first.body)) {
      const el = first.body.elements[0];
      if (el && ts.isIdentifier(el)) arrowReturnIdentifier = el.text;
    }
  } else if (ts.isIdentifier(expr)) {
    name = expr.text;
  } else {
    name = expr.getText(sourceFile);
  }
  return { name, argsText, arrowReturnIdentifier };
}

/** Resolve a relative import specifier (e.g. "./journal-line-input.dto") to an actual file on disk. */
function resolveImportSpecifier(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined; // package import, not a local file
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [`${base}.ts`, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function scanImports(sourceFile: ts.SourceFile, filePath: string): Map<string, string> {
  const importedFrom = new Map<string, string>();
  ts.forEachChild(sourceFile, node => {
    if (!ts.isImportDeclaration(node)) return;
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;
    const resolved = resolveImportSpecifier(filePath, node.moduleSpecifier.text);
    if (!resolved) return;
    const clause = node.importClause;
    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
    for (const spec of clause.namedBindings.elements) {
      importedFrom.set(spec.name.text, resolved);
    }
  });
  return importedFrom;
}

export function scanDtoFile(filePath: string): ScannedDtoClass[] {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const results: ScannedDtoClass[] = [];
  const relativePath = path.relative(SERVER_SRC, filePath).split(path.sep).join("/");
  const importedFrom = scanImports(sourceFile, filePath);

  ts.forEachChild(sourceFile, node => {
    if (!ts.isClassDeclaration(node) || !node.name) return;
    const isExported = (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) return;
    if (!/Dto$/.test(node.name.text)) return;

    let extendsClassName: string | undefined;
    for (const clause of node.heritageClauses ?? []) {
      if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      const first = clause.types[0];
      if (first && ts.isIdentifier(first.expression)) extendsClassName = first.expression.text;
    }

    const properties: ScannedProperty[] = [];
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member) || !member.name) continue;
      if (!ts.isIdentifier(member.name)) continue;
      const decorators = decoratorsOfNode(member).map(d => scanDecorator(sourceFile, d));
      properties.push({
        name: member.name.text,
        optionalToken: member.questionToken !== undefined,
        typeText: member.type ? member.type.getText(sourceFile) : "unknown",
        decorators,
      });
    }
    results.push({ className: node.name.text, filePath, relativePath, properties, extendsClassName, importedFrom });
  });

  return results;
}

export function scanAllDtoClasses(): ScannedDtoClass[] {
  const out: ScannedDtoClass[] = [];
  for (const file of findAllDtoFiles()) {
    out.push(...scanDtoFile(file));
  }
  return out;
}
