"use strict";

const base = require("@klickit/config/jest/base");

/**
 * Deviates from the shared base preset's `roots: ["<rootDir>/src"]` (see
 * packages/server/jest.config.js for the "normal" shape every other package
 * uses) because this package's completeness test (src/__tests__/completeness.spec.ts)
 * needs to `require()` the codegen modules under packages/contracts/codegen/ —
 * outside src/ by design (see codegen/generate-zod-schemas.ts's own doc comment:
 * codegen/ is a build-time-only tool, never part of the published src/ runtime
 * surface, so it must not live inside src/). `roots: ["<rootDir>"]` keeps test
 * DISCOVERY scoped by `testMatch` below (still only src/__tests__/**), while
 * letting Jest's module resolver reach codegen/ for the completeness test's own
 * `require("../../codegen/dto-scan")` (the codegen module doing the SAME source
 * scan the generator itself ran, re-derived fresh rather than trusted from a
 * cached manifest — see that test file's own doc comment for why).
 */
module.exports = {
  ...base,
  rootDir: __dirname,
  roots: ["<rootDir>"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/dist-codegen/"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts", "!src/**/index.ts", "!src/generated/**"],
  coverageThreshold: undefined,
  transform: {
    // tsconfig.codegen.json (not tsconfig.json) — the test needs to compile files under
    // codegen/ too (excluded from tsconfig.json's own `include`, since that one governs the
    // package's PUBLISHED src/ build output only), and needs experimentalDecorators/
    // emitDecoratorMetadata to load the actual class-validator DTO files it re-scans.
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.codegen.json" }],
  },
};
