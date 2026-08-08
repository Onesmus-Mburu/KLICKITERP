/**
 * Real completeness verification for Part 2 (full zod DTO coverage), not a manual eyeball
 * check. This test independently RE-SCANS every `*.dto.ts` file under packages/server/src
 * (the same `dto-scan.ts` the generator itself uses, but that module only reads source text —
 * it has no memory of what the generator actually wrote to disk), then for every DTO class it
 * finds:
 *   1. Computes the expected generated schema file path + export name using the SAME naming
 *      convention module (`codegen/naming.ts`) the generator uses — not by re-deriving it
 *      independently, so a naming-convention bug can't accidentally cancel out between
 *      generator and test.
 *   2. Asserts that file exists on disk and exports a Zod schema under that name.
 *   3. Asserts the schema is a real Zod object-like schema (ZodObject, or a ZodEffects/lazy
 *      wrapper unwrapped to one — a `.merge()` result is a ZodObject too) whose recognized
 *      top-level keys (`.shape`) are EXACTLY the DTO class's own declared property names — no
 *      missing key, no extra key.
 *
 * This is what gives real, mechanical evidence of "every DTO class has a matching zod schema
 * with the right shape", rather than a claim resting on the generator having run once.
 */
import * as path from "node:path";
import { z } from "zod";
import { scanAllDtoClasses, type ScannedDtoClass } from "../../codegen/dto-scan";
import { computeOutRelativePath, schemaVarNameFor } from "../../codegen/naming";

const CONTRACTS_SRC = path.resolve(__dirname, "..");

/**
 * Same disambiguation rule `codegen/decorator-to-zod.ts`'s `resolveClassRef` uses (same-file
 * declaration preferred, then the referencing file's own `import` statement) — re-implemented
 * here rather than imported, deliberately: this test's whole point is to verify the generator's
 * OUTPUT against an independently re-derived expectation, so it re-derives "who does class X's
 * `extends Y` actually refer to" itself instead of trusting the generator's own registry.
 */
function resolveScannedClassRef(
  name: string,
  contextClass: ScannedDtoClass,
  byName: Map<string, ScannedDtoClass[]>,
): ScannedDtoClass | undefined {
  const candidates = byName.get(name);
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const sameFile = candidates.find(c => c.filePath === contextClass.filePath);
  if (sameFile) return sameFile;
  const importedFromPath = contextClass.importedFrom.get(name);
  if (importedFromPath) return candidates.find(c => c.filePath === importedFromPath);
  return undefined;
}

/**
 * A DTO class's full validated/serialized property set includes whatever it inherits via
 * `extends` (e.g. `AccountTreeNodeResponseDto extends AccountResponseDto` — the generated
 * schema legitimately mirrors BOTH via `.merge()`, see generate-zod-schemas.ts), so the
 * expectation this test checks against must include inherited property names too, not just
 * the class's own directly-declared ones.
 */
function allPropertyNames(scanned: ScannedDtoClass, byName: Map<string, ScannedDtoClass[]>, seen = new Set<string>()): Set<string> {
  const names = new Set(scanned.properties.map(p => p.name));
  if (scanned.extendsClassName && !seen.has(scanned.extendsClassName)) {
    seen.add(scanned.extendsClassName);
    const parent = resolveScannedClassRef(scanned.extendsClassName, scanned, byName);
    if (parent) for (const n of allPropertyNames(parent, byName, seen)) names.add(n);
  }
  return names;
}

/** Unwrap ZodEffects/ZodOptional/ZodNullable/etc. down to the underlying ZodObject, if any. */
function unwrapToZodObject(schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape> | undefined {
  let current: z.ZodTypeAny = schema;
  // eslint-disable-next-line no-constant-condition
  for (let i = 0; i < 10; i++) {
    if (current instanceof z.ZodObject) return current;
    const inner = (current as unknown as { _def?: { schema?: z.ZodTypeAny; innerType?: z.ZodTypeAny } })._def;
    if (inner?.innerType) current = inner.innerType;
    else if (inner?.schema) current = inner.schema;
    else return undefined;
  }
  return undefined;
}

describe("packages/contracts zod DTO coverage — completeness", () => {
  const scannedClasses = scanAllDtoClasses();
  const byName = new Map<string, ScannedDtoClass[]>();
  for (const c of scannedClasses) {
    const list = byName.get(c.className);
    if (list) list.push(c);
    else byName.set(c.className, [c]);
  }

  it("found a real, non-trivial number of DTO classes to check (sanity guard against a broken scan)", () => {
    expect(scannedClasses.length).toBeGreaterThan(400);
  });

  describe.each(scannedClasses.map(c => [c.relativePath, c.className, c] as const))(
    "%s :: %s",
    (_relativePath, className, scanned) => {
      const outRelativePath = computeOutRelativePath(scanned.relativePath);
      const schemaVarName = schemaVarNameFor(className);
      const outAbsolutePath = path.join(CONTRACTS_SRC, outRelativePath);

      it(`has a generated schema module at src/${outRelativePath}`, () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        expect(() => require(outAbsolutePath)).not.toThrow();
      });

      it(`exports \`${schemaVarName}\` as a zod object whose shape matches the DTO's own property list`, () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(outAbsolutePath);
        expect(mod).toHaveProperty(schemaVarName);
        const schema = mod[schemaVarName] as z.ZodTypeAny;
        expect(schema).toBeInstanceOf(z.ZodType);

        const zodObject = unwrapToZodObject(schema);
        expect(zodObject).toBeDefined();

        const expectedKeys = allPropertyNames(scanned, byName);
        const actualKeys = new Set(Object.keys(zodObject!.shape));

        const missing = [...expectedKeys].filter(k => !actualKeys.has(k));
        const extra = [...actualKeys].filter(k => !expectedKeys.has(k));

        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });
    },
  );
});
