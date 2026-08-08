import { ReportDefinition, ReportRegistryService, ReportResult } from "../application/report-registry.service";

function makeDefinition(overrides: Partial<ReportDefinition> = {}): ReportDefinition {
  return {
    code: "sample-report",
    name: "Sample Report",
    domain: "accounting",
    permissionCode: "reports:sample-report:view",
    paramsShape: {},
    columns: [],
    execute: async (): Promise<ReportResult> => ({ rows: [], generatedAt: new Date() }),
    ...overrides,
  };
}

describe("ReportRegistryService", () => {
  let registry: ReportRegistryService;

  beforeEach(() => {
    registry = new ReportRegistryService();
  });

  it("registers a definition and retrieves it by code via get()", () => {
    const definition = makeDefinition();
    registry.register(definition);

    expect(registry.get("sample-report")).toBe(definition);
  });

  it("throws NotFoundException when get() is called with an unregistered code", () => {
    expect(() => registry.get("does-not-exist")).toThrow(/not found/i);
  });

  it("throws ConflictException registering a duplicate code", () => {
    registry.register(makeDefinition({ code: "dup" }));
    expect(() => registry.register(makeDefinition({ code: "dup" }))).toThrow(/already registered/i);
  });

  it("list() returns every registered report sorted by domain then code", () => {
    registry.register(makeDefinition({ code: "trial-balance", domain: "accounting" }));
    registry.register(makeDefinition({ code: "student-statement", domain: "students" }));
    registry.register(makeDefinition({ code: "balance-sheet", domain: "accounting" }));
    registry.register(makeDefinition({ code: "aging-outstanding", domain: "billing" }));

    const codes = registry.list().map((d) => `${d.domain}:${d.code}`);
    expect(codes).toEqual([
      "accounting:balance-sheet",
      "accounting:trial-balance",
      "billing:aging-outstanding",
      "students:student-statement",
    ]);
  });

  it("list() returns an empty array when nothing is registered", () => {
    expect(registry.list()).toEqual([]);
  });
});
