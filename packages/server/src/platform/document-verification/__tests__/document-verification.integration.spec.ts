import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { DocumentVerificationService } from "../application/document-verification.service";
import { DocvRecordEntity } from "../domain/docv-record.entity";
import { DocvRecordRepository } from "../infrastructure/docv-record.repository";

/**
 * Integration test against a real Postgres instance (via the actual
 * `AppDataSource`), mirroring `platform/files`' own
 * `files.integration.spec.ts` pattern — the most recently-added,
 * comparably-small platform module before this one. Self-skips (not fails)
 * when Docker/Postgres isn't reachable in this environment, same as every
 * other integration spec in this codebase.
 */
describe("document-verification module — integration (real Postgres)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[document-verification.integration.spec] Skipping DB-backed assertions — no reachable Postgres: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("docv_record table is reachable and the entity metadata matches the DDL", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[document-verification.integration.spec] SKIPPED (no DB) — docv_record reachability check");
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(DocvRecordEntity).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("mints a real token inside a transaction, then verify()/findByDocument() resolve it back — a real round trip through Postgres, plus a real 404-shaped miss for a garbage token", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[document-verification.integration.spec] SKIPPED (no DB) — real mint/verify round trip");
      return;
    }
    const source = dataSource;
    const repository = new DocvRecordRepository(source.getRepository(DocvRecordEntity));
    const service = new DocumentVerificationService(repository);

    const documentId = generateUuidV7();
    let mintedToken: string | null = null;
    try {
      const { token } = await runInTransaction(source, (manager) =>
        service.mint(manager, {
          documentType: "DOCV_INTEGRATION_TEST",
          documentId,
          documentRef: "Integration Test Doc",
          summary: { note: "integration test" },
        }),
      );
      mintedToken = token;

      const verified = await service.verify(token);
      expect(verified).not.toBeNull();
      expect(verified?.documentType).toBe("DOCV_INTEGRATION_TEST");
      expect(verified?.documentRef).toBe("Integration Test Doc");
      expect(verified?.summary).toEqual({ note: "integration test" });
      expect(verified?.issuedAt).toBeInstanceOf(Date);

      const byDocument = await service.findByDocument("DOCV_INTEGRATION_TEST", documentId);
      expect(byDocument).toEqual({ token });

      const unknown = await service.verify("this-token-does-not-exist-anywhere-1234567890");
      expect(unknown).toBeNull();
    } finally {
      if (mintedToken) {
        await source.getRepository(DocvRecordEntity).delete({ token: mintedToken });
      }
    }
  }, 30_000);
});
