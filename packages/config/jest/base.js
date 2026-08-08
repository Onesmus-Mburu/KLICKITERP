"use strict";

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: process.cwd(),
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.spec.ts", "**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/**/*.test.ts",
    "!src/**/index.ts",
    "!src/migrations/**",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  clearMocks: true,
  restoreMocks: true,
  // Jest's built-in default is 5000ms for both `it()` bodies AND `beforeAll`/`afterAll` hooks.
  // That was never a problem before this suite ever ran against a real database: every
  // integration spec's `beforeAll` does a connectivity PROBE first and self-skips (fast,
  // well under 5s) whenever Postgres is unreachable. Found running the full suite for real
  // for the first time (Phase 5 Full Verification) — `AppDataSource.initialize()` legitimately
  // takes longer than 5s under ts-jest (parses all 34 migration files + ~140 entity files, then
  // opens a real TCP connection), so `licensing-e2e.integration.spec.ts`'s (and, by the same
  // mechanism, every one of the other 30 `*.integration.spec.ts` files') `beforeAll` hook timed
  // out at the default 5000ms; the resulting mid-flight Jest environment teardown then raced
  // typeorm's still-in-flight dynamic `import()` calls, producing a wall of unrelated
  // "trying to import a file after the Jest environment has been torn down" noise on top of the
  // real timeout. None of the 32 integration specs set a per-file/per-hook override (confirmed
  // via a repo-wide search for `jest.setTimeout`), so this is fixed once, here, for all of them
  // (and for any future integration spec) rather than patched 31 times.
  testTimeout: 30000,
};
