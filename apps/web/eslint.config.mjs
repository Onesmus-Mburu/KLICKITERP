import { FlatCompat } from "@eslint/eslintrc";
// @klickit/config's shared flat-config base: TS-recommended rules +
// `import/no-restricted-paths` module-boundary zones. The zones are keyed
// off packages/config/eslint/module-deps.json, which only registers
// packages/server/src/<module> paths — no zone's `from` glob can ever match
// a file under apps/web, so this rule is a documented no-op here. Reused
// anyway (rather than reinvented) for the same TS-recommended rule set
// apps/api/apps/worker/tools already share, per this monorepo's own
// "don't reinvent config" convention.
import klickitBase from "@klickit/config/eslint/index.js";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

// Phase 6 Slice 3b follow-up — a real, previously-latent config collision
// found while adding `@radix-ui/react-popover`: `next/core-web-vitals` (via
// `compat.extends` above) registers its OWN `eslint-plugin-import` instance
// under the `"import"` plugin key for every `.ts`/`.tsx` file;
// `@klickit/config`'s base does the same (needed for its
// `import/no-restricted-paths` rule). Both resolve `eslint-plugin-import`
// at the identical `2.32.0` version, but pnpm's peer-dependency-scoped store
// gives the two `require()`s distinct object identities (confirmed via
// `pnpm why eslint-plugin-import -r` → "1 version, 2 instances" — one
// pulled in via `eslint-config-next`'s own `eslint-import-resolver-
// typescript` chain, one via `@klickit/config`'s direct dependency, each
// with a different visible optional-peer set). ESLint's flat config
// correctly refuses to silently merge two different plugin objects under
// the same key (`ConfigError: Cannot redefine plugin "import"`) — and since
// pnpm's peer-instance bucketing isn't guaranteed stable across separate
// `install`/`add` runs, this could start/stop reproducing based on
// unrelated dependency changes elsewhere in the workspace.
// `import/no-restricted-paths` is a genuine no-op for apps/web regardless
// (per the doc comment above — module-deps.json's zones only ever target
// packages/server/src/<module> paths), so rather than fight pnpm's instance
// bucketing for a rule that never fires here, the `import` plugin + that one
// rule are stripped back out of the spread `klickitBase` array for apps/web
// specifically. Every other real rule `klickitBase` provides (the full
// `@typescript-eslint` recommended set, `no-unused-vars`) is kept untouched,
// and `packages/config/eslint/index.js` itself is untouched — apps/api,
// apps/worker, and tools all still get the unmodified shared config.
const klickitBaseWithoutImportPlugin = klickitBase.map((config) => {
  if (!config.plugins?.import) return config;
  const { import: _importPlugin, ...restPlugins } = config.plugins;
  const { "import/no-restricted-paths": _noRestrictedPaths, ...restRules } = config.rules ?? {};
  return { ...config, plugins: restPlugins, rules: restRules };
});

export default [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals"),
  ...klickitBaseWithoutImportPlugin,
  {
    rules: {
      // Next.js route handlers/generated types legitimately use `any` in a
      // few narrow spots (e.g. dynamic route params) — downgraded to warn,
      // matching every other package's own convention in this monorepo.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
