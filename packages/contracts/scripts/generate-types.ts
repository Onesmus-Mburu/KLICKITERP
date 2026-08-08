/**
 * Generates src/generated/openapi-types.ts from openapi.json (Part 1). Run via
 * `pnpm --filter contracts run generate:types` (ts-node), or as the first half of
 * `pnpm --filter contracts run generate`.
 *
 * Not a bare `openapi-typescript openapi.json -o ...` CLI call (which is what this started as)
 * because the raw document has a REAL upstream data-quality defect: `@nestjs/swagger`
 * auto-derives each operation's `operationId` as `${ControllerClassName}_${methodName}` with no
 * module-qualification, and several controller class names repeat verbatim across unrelated
 * modules (`AccountsController` exists in both `accounting` and `banking`; `CategoriesController`
 * in `inventory`/`expenses`/`fixed-assets`; `TransfersController` in `banking`/`fixed-assets`/
 * `inventory` — apps/api's own boot log warns about the matching duplicate-DTO-class-name half of
 * this, "Duplicate DTO detected: ... is defined multiple times with different schemas"). OpenAPI
 * 3.x requires `operationId` to be unique across the WHOLE document; this one isn't, so
 * `openapi-typescript` faithfully emits the SAME property key twice (with two different, real,
 * non-overlapping shapes) inside its single generated `operations` interface — which
 * `tsc --noEmit` correctly rejects (TS2300 "Duplicate identifier" / TS2717 "Subsequent property
 * declarations must have the same type").
 *
 * This is a defect in how `apps/api` composes its Swagger document, not in this package — and
 * per this task's own scope boundary, `packages/server`/`apps/api` are read-only here (fixing it
 * there would mean either renaming several controller classes across multiple already-complete,
 * already-tested modules, or hand-supplying `operationId` on every affected route — a
 * `packages/server` edit, out of bounds for this task). Fixed here instead, mechanically and
 * deterministically, on an IN-MEMORY copy only: `openapi.json` on disk stays the exact, unedited
 * document the live server returned (a faithful record, useful for future diffing); only the
 * copy fed to `openapi-typescript` gets colliding `operationId`s disambiguated, by appending the
 * operation's own module path segment (e.g. `AccountsController_list` -> `AccountsController_list__banking`
 * for the second one seen) — always unique per path+method already, so this can never itself
 * collide, and is stable across regenerations since paths don't reorder.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";

const CONTRACTS_ROOT = path.resolve(__dirname, "..");
const OPENAPI_JSON_PATH = path.join(CONTRACTS_ROOT, "openapi.json");
const OUT_PATH = path.join(CONTRACTS_ROOT, "src/generated/openapi-types.ts");

interface OperationLike {
  operationId?: string;
}

function moduleSegmentFor(routePath: string): string {
  // e.g. "/api/v1/banking/accounts/{id}" -> "banking"; "/health" -> "root"
  const segments = routePath.split("/").filter(Boolean);
  const v1Index = segments.indexOf("v1");
  const moduleSegment = v1Index >= 0 ? segments[v1Index + 1] : segments[0];
  return moduleSegment ?? "root";
}

function dedupeOperationIds(doc: Record<string, unknown>): { doc: Record<string, unknown>; renamed: string[] } {
  const seen = new Map<string, number>();
  const renamed: string[] = [];
  const paths = (doc.paths ?? {}) as Record<string, Record<string, OperationLike>>;

  for (const [routePath, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation || typeof operation !== "object" || !("operationId" in operation)) continue;
      const original = operation.operationId;
      if (!original) continue;

      const count = seen.get(original) ?? 0;
      seen.set(original, count + 1);
      if (count === 0) continue; // first occurrence keeps its natural id

      let candidate = `${original}__${moduleSegmentFor(routePath)}`;
      if (seen.has(candidate)) candidate = `${candidate}_${count}`; // final deterministic fallback
      operation.operationId = candidate;
      renamed.push(`${method.toUpperCase()} ${routePath}: "${original}" -> "${candidate}"`);
    }
  }

  return { doc, renamed };
}

async function main() {
  const raw = fs.readFileSync(OPENAPI_JSON_PATH, "utf8");
  const original = JSON.parse(raw) as Record<string, unknown>;
  const { doc: normalized, renamed } = dedupeOperationIds(original);

  if (renamed.length > 0) {
    console.log(`generate-types: disambiguated ${renamed.length} duplicate operationId(s) (see codegen/../scripts/generate-types.ts doc comment for why):`);
    for (const line of renamed) console.log(`  - ${line}`);
  } else {
    console.log("generate-types: no duplicate operationIds found.");
  }

  const nodes = await openapiTS(normalized as never, { silent: true });
  const body = astToString(nodes);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${COMMENT_HEADER}${body}`, "utf8");
  console.log(`generate-types: wrote ${OUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
