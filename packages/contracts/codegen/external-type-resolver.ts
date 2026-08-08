/**
 * Several `*-response.dto.ts` classes have zero class-validator decorators on a property
 * (response DTOs validate nothing) and declare a TS type that is itself an identifier imported
 * from a domain entity file, e.g. `kind!: PyrlComponentKind;` where
 * `packages/server/src/domains/payroll/domain/pyrl-component.entity.ts` exports
 * `export type PyrlComponentKind = "FIXED" | "STATUTORY" | ...;`, or
 * `status!: (typeof INSTANCE_STATUSES)[number];` referencing an `export const INSTANCE_STATUSES = [...] as const;`.
 * This is a small, targeted resolver (not a general type-checker) that follows the DTO file's
 * own import statement to the entity file and extracts a string-literal union / const-array's
 * values directly from source — used by `decorator-to-zod.ts`'s TS-type fallback path only
 * when no class-validator decorator supplied a value set.
 */
import * as fs from "node:fs";
import * as ts from "typescript";

const fileCache = new Map<string, ts.SourceFile>();

function getSourceFile(filePath: string): ts.SourceFile | undefined {
  let sf = fileCache.get(filePath);
  if (sf) return sf;
  if (!fs.existsSync(filePath)) return undefined;
  const text = fs.readFileSync(filePath, "utf8");
  sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  fileCache.set(filePath, sf);
  return sf;
}

function hasExportModifier(node: ts.Node): boolean {
  return (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function extractStringLiteralUnion(typeNode: ts.TypeNode): string[] | undefined {
  if (ts.isUnionTypeNode(typeNode)) {
    const values: string[] = [];
    for (const t of typeNode.types) {
      if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) values.push(t.literal.text);
      else return undefined;
    }
    return values;
  }
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) return [typeNode.literal.text];
  return undefined;
}

/** `export type <name> = "A" | "B" | ...;` */
export function resolveExportedStringUnionType(filePath: string, name: string): string[] | undefined {
  const sf = getSourceFile(filePath);
  if (!sf) return undefined;
  let result: string[] | undefined;
  ts.forEachChild(sf, node => {
    if (result || !ts.isTypeAliasDeclaration(node) || node.name.text !== name || !hasExportModifier(node)) return;
    result = extractStringLiteralUnion(node.type);
  });
  return result;
}

/** `export const <name> = ["A", "B", ...] as const;` (or a plain array literal, `as const` optional). */
export function resolveExportedConstStringArray(filePath: string, name: string): string[] | undefined {
  return findConstStringArray(filePath, name, /* requireExport */ true);
}

/**
 * Same as `resolveExportedConstStringArray` but for a MODULE-PRIVATE `const X = [...] as const;`
 * declared in the same file as the DTO class referencing it (e.g.
 * `action-response.dto.ts`'s own local `const DECISIONS = [...] as const;`, never exported
 * because nothing outside that one file needs it) — no `export` keyword required.
 */
export function resolveSameFileConstStringArray(filePath: string, name: string): string[] | undefined {
  return findConstStringArray(filePath, name, /* requireExport */ false);
}

function findConstStringArray(filePath: string, name: string, requireExport: boolean): string[] | undefined {
  const sf = getSourceFile(filePath);
  if (!sf) return undefined;
  let result: string[] | undefined;
  ts.forEachChild(sf, node => {
    if (result || !ts.isVariableStatement(node) || (requireExport && !hasExportModifier(node))) return;
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name || !decl.initializer) continue;
      let init: ts.Expression = decl.initializer;
      if (ts.isAsExpression(init)) init = init.expression;
      if (!ts.isArrayLiteralExpression(init)) continue;
      const values: string[] = [];
      let ok = true;
      for (const el of init.elements) {
        if (ts.isStringLiteral(el)) values.push(el.text);
        else {
          ok = false;
          break;
        }
      }
      if (ok) result = values;
    }
  });
  return result;
}
