/**
 * The mechanical translator at the heart of Part 2 (see docs/phase-5/PROGRESS.md's
 * "packages/contracts" section for the full rationale). For a single DTO
 * property, combines:
 *   1. class-validator's OWN runtime metadata (`getMetadataStorage().getTargetValidationMetadatas`)
 *      — the authoritative source for concrete constraint VALUES (a `@MaxLength(120)`'s `120`,
 *      an `@IsEnum(X)`'s already-resolved list of legal values, a `@Matches(/.../)`'s compiled
 *      RegExp, an `@IsIn([...])`'s allowed-values array) because these are already-evaluated
 *      JS values sitting on the metadata object — reading them beats re-parsing/re-evaluating
 *      decorator argument source text by hand.
 *   2. The TS-source scan (`dto-scan.ts`) for whatever runtime metadata cannot supply: a
 *      property's declared TS type (used as a structural fallback for properties with zero
 *      class-validator decorators — very common on `*-response.dto.ts` read-model classes,
 *      which validate nothing and exist purely to shape Swagger/serialized output), and the
 *      identifier a `@Type(() => X)` arrow function returns (class-transformer's own `@Type`
 *      metadata is not stored in class-validator's MetadataStorage at all).
 *
 * Every property gets a zod expression; unmapped/exotic decorators fall back to a permissive
 * schema (z.unknown()/inferred-from-TS-type) with a `// codegen:` comment naming what wasn't
 * translated, rather than silently dropping the property — this keeps the completeness
 * check meaningful (every DTO property is ALWAYS present in its zod schema's shape) even on
 * the rare decorator this translator doesn't yet special-case.
 */
import { ValidationTypes } from "class-validator";
import type { ScannedDecorator, ScannedDtoClass, ScannedProperty } from "./dto-scan";

/**
 * class-validator's own `ValidationMetadata` CLASS (metadata/ValidationMetadata.ts) is not
 * re-exported from the package's public entrypoint (only `MetadataStorage`/`getMetadataStorage`
 * are) — this is the minimal structural shape this module actually reads off each metadata
 * object returned by `getMetadataStorage().getTargetValidationMetadatas()`, kept in sync with
 * that class's real shape (see node_modules/class-validator/.../metadata/ValidationMetadata.d.ts)
 * rather than importing a package-internal path that isn't part of its stable public API.
 */
export interface ValidationMetadata {
  type: string;
  name?: string;
  propertyName: string;
  constraints?: unknown[];
  each: boolean;
  groups?: string[];
  always?: boolean;
}
import {
  resolveExportedConstStringArray,
  resolveExportedStringUnionType,
  resolveSameFileConstStringArray,
} from "./external-type-resolver";

export interface ClassRegistryEntry {
  className: string;
  schemaVarName: string;
  /** Absolute source DTO file path this class was declared in (disambiguates duplicate class names across modules). */
  sourceFilePath: string;
  /** Output file path, relative to packages/contracts/src, e.g. "platform/users/create-user.schema.ts" */
  outRelativePath: string;
}

/**
 * Keyed by className. Several DTO class names repeat verbatim across unrelated modules
 * (e.g. `CreateCategoryDto` in both domains/inventory and domains/expenses — NestJS itself
 * warns about this at Swagger-generation time, see docs/phase-5/PROGRESS.md), so every
 * className maps to the list of all classes sharing that name; `resolveClassRef` below picks
 * the right one for a given reference site using the referencing file's own import statements
 * (or same-file declaration) rather than trusting a bare name to be globally unique.
 */
export type ClassRegistry = Map<string, ClassRegistryEntry[]>;

/**
 * Resolve a bare class-name reference (from a `@Type(() => X)` arrow body, or a TS type
 * annotation like `lines: X[]`) to the correct registry entry, disambiguating by the
 * referencing file's own same-file declarations and import statements.
 */
export function resolveClassRef(
  name: string,
  contextClass: ScannedDtoClass,
  registry: ClassRegistry,
): ClassRegistryEntry | undefined {
  const candidates = registry.get(name);
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  // Prefer a class declared in the SAME file as the reference site.
  const sameFile = candidates.find(c => c.sourceFilePath === contextClass.filePath);
  if (sameFile) return sameFile;

  // Otherwise use the referencing file's own `import { X } from "..."` resolution.
  const importedFromPath = contextClass.importedFrom.get(name);
  if (importedFromPath) {
    const viaImport = candidates.find(c => c.sourceFilePath === importedFromPath);
    if (viaImport) return viaImport;
  }

  return undefined; // genuinely ambiguous — caller falls back to z.unknown() and records it
}

/**
 * True when a resolved reference points back at the class currently being emitted (e.g.
 * `AccountTreeNodeResponseDto.children: AccountTreeNodeResponseDto[]`) — a plain `const X = z.object({
 * ...AtoZodExprReferencingX... })` would throw "Cannot access 'X' before initialization" in that
 * case, so the caller must wrap the reference in `z.lazy(() => X)` instead.
 */
export function isSelfReference(entry: ClassRegistryEntry, contextClass: ScannedDtoClass): boolean {
  return entry.className === contextClass.className && entry.sourceFilePath === contextClass.filePath;
}

export interface TranslateResult {
  /** The zod expression source text, e.g. `z.string().max(120)`. */
  expr: string;
  /** Other DTO class names referenced (for import wiring), by className. */
  referencedClassNames: Set<string>;
  /** Decorator names this translator did not recognize (for reporting only). */
  unrecognized: string[];
}

function isOptionalMeta(m: ValidationMetadata): boolean {
  return m.name === "isOptional";
}

function isNestedMeta(m: ValidationMetadata): boolean {
  return m.type === ValidationTypes.NESTED_VALIDATION;
}

/** Quote a JS primitive as a zod-literal-safe source-text token. */
function lit(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * Translate one property's flat metadata list (already resolved to a single array level —
 * i.e. either the "whole value" metadatas or the "each element" metadatas of an array
 * property) plus the scanned TS type text into a base (non-optional) zod expression.
 */
function translateScalar(
  metas: ValidationMetadata[],
  scanned: ScannedProperty | undefined,
  registry: ClassRegistry,
  contextClass: ScannedDtoClass,
  referencedClassNames: Set<string>,
  unrecognized: string[],
): string {
  let expr: string | null = null;
  let sawString = false;
  let sawNumber = false;
  let sawBoolean = false;
  const calls: string[] = [];

  for (const m of metas) {
    const name = m.name;
    const c = m.constraints ?? [];
    switch (name) {
      case "isString":
      case "isBase64":
        if (!sawString) {
          expr = "z.string()";
          sawString = true;
        }
        break;
      case "isNotEmptyObject":
        expr = expr ?? "z.record(z.string(), z.unknown())";
        break;
      case "isEmail":
        expr = "z.string().email()";
        sawString = true;
        break;
      case "isUuid":
        expr = "z.string().uuid()";
        sawString = true;
        break;
      case "isUrl":
        expr = "z.string().url()";
        sawString = true;
        break;
      case "isIso8601":
      case "isDateString":
        // Deliberately not `.datetime()` — @IsDateString accepts date-only strings
        // ("2026-07-28") as well as full ISO datetimes, and zod's `.datetime()`
        // rejects the former. A plain string keeps this from rejecting valid values;
        // the backend's own class-validator decorator remains the source of truth.
        expr = "z.string()";
        sawString = true;
        break;
      case "isNumber":
      case "isPositive":
      case "isNegative":
      case "isInt":
      case "isDivisibleBy":
      case "min":
      case "max":
        if (!sawNumber) {
          expr = "z.number()";
          sawNumber = true;
        }
        if (name === "isInt") calls.push(".int()");
        if (name === "isPositive") calls.push(".positive()");
        if (name === "isNegative") calls.push(".negative()");
        if (name === "min") calls.push(`.min(${lit(c[0])})`);
        if (name === "max") calls.push(`.max(${lit(c[0])})`);
        break;
      case "isBoolean":
      case "isBooleanString":
        expr = "z.boolean()";
        sawBoolean = true;
        if (name === "isBooleanString") expr = "z.string()"; // string encoding of a boolean, not a boolean value
        break;
      case "isNumberString":
        expr = "z.string()";
        sawString = true;
        break;
      case "isArray":
        // Handled by the caller (translateProperty) — arrays are a distinct branch.
        break;
      case "isEnum": {
        // `constraints: [entity, validEnumValues(entity)]` (class-validator's own IsEnum.js) —
        // `validEnumValues()` only understands real TS `enum` objects (numeric-string keys
        // filtered out); when a DTO passes a plain `as const` array instead (this codebase's
        // own convention for value sets, e.g. `PAY_RECEIPT_SPLIT_METHODS`), constraints[1]
        // comes back empty even though the actual runtime check (constraints[0]) works fine —
        // fall back to constraints[0] directly in that case.
        let values: unknown[] = (c[1] as unknown[] | undefined) ?? [];
        if (values.length === 0) {
          const entity = c[0];
          if (Array.isArray(entity)) values = entity as unknown[];
          else if (entity && typeof entity === "object") values = Object.values(entity);
        }
        if (values.length > 0 && values.every(v => typeof v === "string")) {
          expr = `z.enum([${values.map(v => lit(v)).join(", ")}])`;
        } else if (values.length > 0) {
          expr = `z.union([${values.map(v => `z.literal(${lit(v)})`).join(", ")}])`;
        } else {
          expr = "z.unknown()";
          unrecognized.push("isEnum(<empty>)");
        }
        break;
      }
      case "isIn": {
        const values: unknown[] = (c[0] as unknown[] | undefined) ?? [];
        if (values.length > 0 && values.every(v => typeof v === "string")) {
          expr = `z.enum([${values.map(v => lit(v)).join(", ")}])`;
        } else if (values.length > 0) {
          expr = `z.union([${values.map(v => `z.literal(${lit(v)})`).join(", ")}])`;
        } else {
          expr = expr ?? "z.unknown()";
        }
        break;
      }
      case "maxLength":
        sawString = true;
        expr = expr ?? "z.string()";
        calls.push(`.max(${lit(c[0])})`);
        break;
      case "minLength":
        sawString = true;
        expr = expr ?? "z.string()";
        calls.push(`.min(${lit(c[0])})`);
        break;
      case "isLength":
        sawString = true;
        expr = expr ?? "z.string()";
        if (c[0] !== undefined && c[0] !== null) calls.push(`.min(${lit(c[0])})`);
        if (c[1] !== undefined && c[1] !== null) calls.push(`.max(${lit(c[1])})`);
        break;
      case "matches": {
        sawString = true;
        expr = expr ?? "z.string()";
        const pattern = c[0];
        if (pattern instanceof RegExp) {
          calls.push(`.regex(${pattern.toString()})`);
        }
        break;
      }
      case "isNotEmpty":
        if (sawString || (!sawNumber && !sawBoolean)) {
          expr = expr ?? "z.string()";
          calls.push(".min(1)");
        }
        break;
      case "arrayNotEmpty":
      case "arrayMinSize":
      case "arrayMaxSize":
        // Array-level constraints, handled by the caller (array branch).
        break;
      case "isOptional":
        // Handled by the caller.
        break;
      case "isDefined":
        break;
      case "isObject":
        expr = expr ?? "z.record(z.string(), z.unknown())";
        break;
      case "isLatitude":
      case "isLongitude":
        expr = "z.number()";
        sawNumber = true;
        break;
      case "isJSON":
        expr = "z.string()";
        sawString = true;
        break;
      case "isMobilePhone":
      case "isPhoneNumber":
        expr = "z.string()";
        sawString = true;
        break;
      case "isMongoId":
      case "isIp":
        expr = "z.string()";
        sawString = true;
        break;
      case "isHexColor":
      case "isTimeZone":
      case "isMimeType":
        expr = "z.string()";
        sawString = true;
        break;
      default:
        if (name) unrecognized.push(name);
        break;
    }
  }

  if (expr === null) {
    // No recognized class-validator constraint at all on this property (typical of
    // *-response.dto.ts classes, which only carry @ApiProperty()) — fall back to the
    // TS-source-scanned declared type.
    expr = zodFromTsTypeText(scanned?.typeText ?? "unknown", registry, contextClass, referencedClassNames, unrecognized);
    return expr;
  }

  return expr + calls.join("");
}

/** Split `text` on top-level occurrences of `sep` (a single character), ignoring separators nested inside (), [], {}, <>. */
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if ("([{<".includes(ch)) depth++;
    else if (")]}>".includes(ch)) depth--;
    if (ch === sep && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

/** `{ key: type; key2?: type2 }` inline object type literal -> z.object({...}), depth-aware on `;`. */
function tryParseInlineObjectLiteral(
  stripped: string,
  registry: ClassRegistry,
  contextClass: ScannedDtoClass,
  referencedClassNames: Set<string>,
  unrecognized: string[],
): string | undefined {
  if (!stripped.startsWith("{") || !stripped.endsWith("}")) return undefined;
  const body = stripped.slice(1, -1);
  const members = splitTopLevel(body, ";").filter(m => m.length > 0);
  const lines: string[] = [];
  for (const member of members) {
    const match = /^([A-Za-z_$][A-Za-z0-9_$]*)(\?)?\s*:\s*(.+)$/.exec(member);
    if (!match) return undefined; // not a simple `key: type` member — bail to the permissive fallback
    const [, key, optional, memberType] = match;
    let memberExpr = zodFromTsTypeText(memberType, registry, contextClass, referencedClassNames, unrecognized);
    if (optional) memberExpr += ".optional()";
    lines.push(`    ${key}: ${memberExpr},`);
  }
  return `z.object({\n${lines.join("\n")}\n  })`;
}

/** Best-effort TS type-text -> zod expression, used only when no class-validator decorator drove the type. */
function zodFromTsTypeText(
  typeText: string,
  registry: ClassRegistry,
  contextClass: ScannedDtoClass,
  referencedClassNames: Set<string>,
  unrecognized: string[],
): string {
  const t = typeText.trim();
  const stripped = t.replace(/\s*\|\s*null\b/g, "").replace(/\s*\|\s*undefined\b/g, "").trim();

  if (stripped === "string") return "z.string()";
  if (stripped === "number") return "z.number()";
  if (stripped === "boolean") return "z.boolean()";
  if (stripped === "Date") return "z.coerce.date()";
  if (stripped === "any" || stripped === "unknown") return "z.unknown()";
  if (stripped === "void" || stripped === "never") return "z.unknown()";

  // Array forms: `X[]` or `Array<X>`
  const arrayBracket = /^(.+)\[\]$/.exec(stripped);
  const arrayGeneric = /^Array<(.+)>$/.exec(stripped);
  const inner = arrayBracket?.[1] ?? arrayGeneric?.[1];
  if (inner) {
    return `z.array(${zodFromTsTypeText(inner, registry, contextClass, referencedClassNames, unrecognized)})`;
  }

  // Record<string, X>
  const record = /^Record<\s*string\s*,\s*(.+)>$/.exec(stripped);
  if (record) {
    return `z.record(z.string(), ${zodFromTsTypeText(record[1], registry, contextClass, referencedClassNames, unrecognized)})`;
  }

  // Inline object type literal: `{ total: number; page: number }`
  const objectLiteral = tryParseInlineObjectLiteral(stripped, registry, contextClass, referencedClassNames, unrecognized);
  if (objectLiteral) return objectLiteral;

  // Single string literal: "A"
  if (/^["'].*["']$/.test(stripped)) {
    return `z.literal(${JSON.stringify(stripped.slice(1, -1))})`;
  }

  // `(typeof CONST_ARRAY)[number]` — an exported `as const` string array used as an element-type reference.
  const typeofArrayMatch = /^\(typeof\s+([A-Za-z_$][A-Za-z0-9_$]*)\)\[number\]$/.exec(stripped);
  if (typeofArrayMatch) {
    const constName = typeofArrayMatch[1];
    // Not-exported same-file `const X = [...] as const` is common (e.g. action-response.dto.ts's
    // own `DECISIONS`) as well as an imported one — `resolveExportedConstStringArray` requires
    // `export`, so also try a same-file, non-export-required lookup via the same file path.
    const fromFile = contextClass.importedFrom.get(constName) ?? contextClass.filePath;
    const values =
      resolveExportedConstStringArray(fromFile, constName) ?? resolveSameFileConstStringArray(contextClass.filePath, constName);
    if (values && values.length > 0) return `z.enum([${values.map(v => JSON.stringify(v)).join(", ")}])`;
  }

  // Reference to another known DTO class in the registry, OR an imported type alias / const array
  // (e.g. `PyrlComponentKind`, `CommChannel`) resolved straight from its own source file.
  const identifierMatch = /^[A-Za-z_$][A-Za-z0-9_$]*$/.exec(stripped);
  if (identifierMatch) {
    const resolved = resolveClassRef(stripped, contextClass, registry);
    if (resolved) {
      referencedClassNames.add(stripped);
      return isSelfReference(resolved, contextClass) ? `z.lazy(() => ${resolved.schemaVarName})` : resolved.schemaVarName;
    }
    const fromFile = contextClass.importedFrom.get(stripped);
    if (fromFile) {
      const unionValues = resolveExportedStringUnionType(fromFile, stripped);
      if (unionValues && unionValues.length > 0) return `z.enum([${unionValues.map(v => JSON.stringify(v)).join(", ")}])`;
      const arrayValues = resolveExportedConstStringArray(fromFile, stripped);
      if (arrayValues && arrayValues.length > 0) return `z.enum([${arrayValues.map(v => JSON.stringify(v)).join(", ")}])`;
    }
  }

  // General union of 2+ heterogeneous parts (e.g. `string[] | "ALL"`) — recurse on each part.
  const unionParts = splitTopLevel(stripped, "|");
  if (unionParts.length > 1) {
    const memberExprs = unionParts.map(p => zodFromTsTypeText(p, registry, contextClass, referencedClassNames, unrecognized));
    return `z.union([${memberExprs.join(", ")}])`;
  }

  // Unknown type reference (an interface, a generic this resolver doesn't special-case, etc.) —
  // permissive fallback: the property KEY stays present (satisfies the structural completeness
  // guarantee) but the value shape isn't validated beyond "present".
  unrecognized.push(`unmapped-ts-type:${stripped}`);
  return "z.unknown()";
}

export function translateProperty(
  scanned: ScannedProperty,
  allMetasForProp: ValidationMetadata[],
  registry: ClassRegistry,
  contextClass: ScannedDtoClass,
): TranslateResult {
  const referencedClassNames = new Set<string>();
  const unrecognized: string[] = [];

  const optionalMeta = allMetasForProp.some(isOptionalMeta);
  const nestedMeta = allMetasForProp.find(isNestedMeta);
  const wholeValueMetas = allMetasForProp.filter(m => !isOptionalMeta(m) && !isNestedMeta(m) && !m.each);
  const eachMetas = allMetasForProp.filter(m => !isOptionalMeta(m) && !isNestedMeta(m) && m.each === true);
  const isArrayFlag = wholeValueMetas.some(m => m.name === "isArray");
  const arrayNotEmpty = wholeValueMetas.some(m => m.name === "arrayNotEmpty");
  const arrayMinSize = wholeValueMetas.find(m => m.name === "arrayMinSize");
  const arrayMaxSize = wholeValueMetas.find(m => m.name === "arrayMaxSize");

  let expr: string;

  if (nestedMeta) {
    const nestedClassName = scanned.decorators.find(d => d.name === "Type")?.arrowReturnIdentifier;
    let itemExpr: string;
    const resolved = nestedClassName ? resolveClassRef(nestedClassName, contextClass, registry) : undefined;
    if (resolved) {
      referencedClassNames.add(resolved.className);
      itemExpr = isSelfReference(resolved, contextClass) ? `z.lazy(() => ${resolved.schemaVarName})` : resolved.schemaVarName;
    } else {
      unrecognized.push(`unresolved-nested-type-for:${scanned.name}`);
      itemExpr = "z.unknown()";
    }
    if (nestedMeta.each) {
      expr = `z.array(${itemExpr})`;
      if (arrayNotEmpty) expr += ".min(1)";
      if (arrayMinSize) expr += `.min(${lit(arrayMinSize.constraints?.[0])})`;
      if (arrayMaxSize) expr += `.max(${lit(arrayMaxSize.constraints?.[0])})`;
    } else {
      expr = itemExpr;
    }
  } else if (isArrayFlag) {
    const itemExpr =
      eachMetas.length > 0
        ? translateScalar(eachMetas, undefined, registry, contextClass, referencedClassNames, unrecognized)
        : zodFromTsTypeText(
            scanned.typeText.replace(/\[\]$/, "").replace(/^Array<(.*)>$/, "$1"),
            registry,
            contextClass,
            referencedClassNames,
            unrecognized,
          );
    expr = `z.array(${itemExpr})`;
    if (arrayNotEmpty) expr += ".min(1)";
    if (arrayMinSize) expr += `.min(${lit(arrayMinSize.constraints?.[0])})`;
    if (arrayMaxSize) expr += `.max(${lit(arrayMaxSize.constraints?.[0])})`;
  } else {
    expr = translateScalar(wholeValueMetas, scanned, registry, contextClass, referencedClassNames, unrecognized);
  }

  const nullable = /\|\s*null\b/.test(scanned.typeText);
  if (nullable) expr += ".nullable()";
  if (optionalMeta || scanned.optionalToken) expr += ".optional()";

  return { expr, referencedClassNames, unrecognized };
}

export function scannedDecoratorNames(decorators: ScannedDecorator[]): string[] {
  return decorators.map(d => d.name);
}
