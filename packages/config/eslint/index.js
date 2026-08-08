"use strict";

const fs = require("node:fs");
const path = require("node:path");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const importPlugin = require("eslint-plugin-import");

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "module-deps.json"), "utf8"),
);

// module-deps.json paths are repo-root-relative, but `import/no-restricted-paths`
// resolves target/from patterns against the ESLint process's cwd — which is a
// per-package directory when lint runs via `pnpm --filter <pkg> lint` / turbo,
// not the repo root. Anchoring every pattern to an absolute, forward-slash path
// keeps the zones correct regardless of which directory ESLint is invoked from.
const REPO_ROOT = path.resolve(__dirname, "../../..");

function toAbsoluteGlob(relativePath) {
  return path.join(REPO_ROOT, relativePath).split(path.sep).join("/");
}

function buildZones(manifest) {
  const zones = [];
  const moduleEntries = Object.entries(manifest.modules);

  for (const [name, def] of moduleEntries) {
    if (def.kind === "shared-kernel") continue;

    const disallow = moduleEntries
      .filter(([otherName, otherDef]) => {
        if (otherName === name) return false;
        const allowed = def.mayImport || [];
        if (allowed.includes(otherName)) return false;
        if (allowed.includes("platform/*") && otherDef.kind === "platform") {
          return false;
        }
        return true;
      })
      .map(([, otherDef]) => toAbsoluteGlob(`${otherDef.path}/**`));

    if (def.importableBy && def.importableBy.length === 0) {
      // `target` must be every OTHER registered module's own path (an
      // array of concrete globs), NOT a single negated-segment extglob like
      // `packages/server/src/**/!(licensing)/**`. That pattern looks like
      // "anything not under licensing" but isn't: `!(licensing)` only
      // negates ONE path segment, and the preceding `**` is free to absorb
      // the literal "licensing" segment itself before the negated segment
      // is tested — so e.g. `packages/server/src/licensing/domain/x.ts`
      // satisfies it too (`**` -> "licensing", `!(licensing)` -> "domain",
      // trailing `**` -> "x.ts"), incorrectly flagging every file INSIDE
      // `licensing/` that imports another file INSIDE `licensing/` as a
      // violation of its own isolation rule. Building target from the
      // manifest's own module list sidesteps glob-negation entirely and
      // also preserves the pre-existing (unstated but real) exemption for
      // paths that aren't a registered module at all, e.g.
      // `packages/server/src/migrations/**` — migrations legitimately
      // register every module's entities (including the isolated one's,
      // see `migrations/data-source.ts`) as DDL/schema tooling, not
      // runtime application code reaching across the boundary; none of the
      // per-module "disallow" zones below have ever restricted migrations
      // either, since their own `target` is likewise scoped to one
      // module's own path.
      const target = moduleEntries
        .filter(([otherName]) => otherName !== name)
        .map(([, otherDef]) => toAbsoluteGlob(`${otherDef.path}/**`));
      zones.push({
        target,
        from: toAbsoluteGlob(`${def.path}/**`),
        message: `${name} is isolated (D5): nothing may import from it (docs/phase-3/01-system-architecture.md §3.3 rule 3).`,
      });
    }

    if (disallow.length > 0) {
      zones.push({
        target: toAbsoluteGlob(`${def.path}/**`),
        from: disallow,
        message: `${name} may only import: shared kernel${(def.mayImport || []).filter((m) => m !== "shared").length ? ", " + def.mayImport.filter((m) => m !== "shared").join(", ") : ""}. See docs/phase-3/01-system-architecture.md §3.3 and packages/config/eslint/module-deps.json.`,
      });
    }
  }

  return zones;
}

const restrictedPathZones = buildZones(manifest);

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2022,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    settings: {
      // eslint-plugin-import's bundled node resolver only looks for
      // .js/.json/.node by default, so it silently fails to resolve our
      // extensionless TypeScript imports and `import/no-restricted-paths`
      // never fires. Extending the extension list makes resolution — and
      // therefore the module-boundary rule — actually work.
      "import/resolver": {
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "import/no-restricted-paths": [
        "error",
        {
          zones: restrictedPathZones,
        },
      ],
    },
  },
];

module.exports.moduleDepsManifest = manifest;
module.exports.buildZones = buildZones;
