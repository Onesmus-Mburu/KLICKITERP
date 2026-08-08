import { EntityManager } from "typeorm";
import { StdStudentRepository } from "../infrastructure/std-student.repository";

describe("StdStudentRepository.searchByNameOrAdmissionNo — FR-PAY-002 trigram search", () => {
  it("issues a pg_trgm raw query with the normalized term and the caller-supplied limit, ordered by relevance", async () => {
    const queryMock = jest.fn(async (_sql: string, _params?: unknown[]) => [
      {
        id: "s1",
        admission_no: "ADM-001",
        first_name: "Jane",
        middle_name: null,
        last_name: "Doe",
        search_name: "jane doe",
        class_id: "class-1",
        stream_id: null,
        status: "ACTIVE",
        boarding: "DAY",
        fee_group_id: null,
        sponsor_id: null,
        transport_route_id: null,
        photo_file_id: null,
        custom_fields: {},
        enrolled_on: "2026-01-01",
        exited_on: null,
        exit_cleared: false,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        version: 1,
        relevance: 0.9,
      },
    ]);
    const em = { query: queryMock } as unknown as EntityManager;
    const repo = new StdStudentRepository({ manager: em } as never);

    const results = await repo.searchByNameOrAdmissionNo("Jane Doe", 5, em);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("similarity(s.search_name");
    expect(sql).toContain("similarity(s.admission_no");
    expect(sql).toContain("ORDER BY relevance DESC");
    expect(sql).toContain("% $1");
    expect(params).toEqual(["jane doe", "jane doe%", 5]);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("s1");
    expect(results[0].admissionNo).toBe("ADM-001");
    expect(results[0].firstName).toBe("Jane");
  });

  it("lowercases and trims the search term before binding it (matches the generated column's own lower(...) expression)", async () => {
    const queryMock = jest.fn(async (_sql: string, _params?: unknown[]) => []);
    const em = { query: queryMock } as unknown as EntityManager;
    const repo = new StdStudentRepository({ manager: em } as never);

    await repo.searchByNameOrAdmissionNo("  JANE  ", 20, em);

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe("jane");
  });

  it("defaults limit to 20 when omitted", async () => {
    const queryMock = jest.fn(async (_sql: string, _params?: unknown[]) => []);
    const em = { query: queryMock } as unknown as EntityManager;
    const repo = new StdStudentRepository({ manager: em } as never);

    await repo.searchByNameOrAdmissionNo("jane", undefined, em);

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(20);
  });
});
