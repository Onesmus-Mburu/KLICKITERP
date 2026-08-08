"use strict";

/**
 * Flat-config entrypoint ESLint 9 requires per package (`eslint` resolves
 * `eslint.config.js` relative to CWD, not via `package.json` `main`).
 * `packages/config/eslint/index.js` already builds the full rule set +
 * module-boundary zones from `module-deps.json` — this file only wires it
 * up for `packages/server` and adds the ignore patterns this package needs.
 */
const baseConfig = require("@klickit/config/eslint");

module.exports = [{ ignores: ["dist/**", "node_modules/**"] }, ...baseConfig];
