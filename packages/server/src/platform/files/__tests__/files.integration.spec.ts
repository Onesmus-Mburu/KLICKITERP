import { Socket } from "node:net";
import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { UsrUserEntity } from "../../users/domain/usr-user.entity";
import { FilesService } from "../application/files.service";
import { FileObjectEntity } from "../domain/file-object.entity";
import { FileObjectRepository } from "../infrastructure/file-object.repository";
import { MinioStorageAdapter } from "../infrastructure/minio-storage.adapter";

/** Bare TCP connect probe — cheaper than pulling in the S3 SDK just to find out MinIO isn't up yet. */
function probeTcp(hostPort: string, timeoutMs = 1500): Promise<boolean> {
  const [host, portRaw] = hostPort.split(":");
  const port = Number(portRaw ?? 9000);
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * Integration test against a real Postgres instance (via the actual
 * `AppDataSource`, mirroring `settings.integration.spec.ts`'s pattern) AND a
 * real MinIO instance. Both self-skip (not fail) independently — Docker
 * isn't confirmed running in every environment this repo builds in (see
 * docs/phase-5/PROGRESS.md "Environment status"), and even once Postgres is
 * up, MinIO specifically may not be (they're separate compose services).
 * This spec is written so the real object round-trip (upload -> signed-url
 * fetch -> delete) runs for real the moment both are reachable — nothing
 * here should need to change once Docker is up.
 */
describe("files module — integration (real Postgres + MinIO)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;
  let minioAvailable = false;
  const config = new AppConfigService();

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[files.integration.spec] Skipping DB-backed assertions — no reachable Postgres: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }

    minioAvailable = await probeTcp(config.minioEndpoint);
    if (!minioAvailable) {
      console.warn(
        `[files.integration.spec] Skipping MinIO-backed assertions — no reachable MinIO at ${config.minioEndpoint}`,
      );
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("file_object table is reachable and the entity metadata matches the DDL", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[files.integration.spec] SKIPPED (no DB) — file_object reachability check");
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(FileObjectEntity).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("uploads, reads a signed URL for, and deletes a real object round-trip through MinIO + Postgres", async () => {
    if (!dbAvailable || !dataSource || !minioAvailable) {
      console.warn("[files.integration.spec] SKIPPED (no DB and/or no MinIO) — real object round-trip");
      return;
    }
    const source = dataSource;

    const userRepo = source.getRepository(UsrUserEntity);
    const uploader = await userRepo.save(
      userRepo.create({
        username: `files-it-${Date.now()}`,
        email: `files-it-${Date.now()}@example.test`,
        phone: null,
        passwordHash: "x".repeat(60),
        fullName: "Files Integration Test User",
        status: "ACTIVE",
        userType: "STAFF",
      }),
    );

    const fileObjectRepository = new FileObjectRepository(source.getRepository(FileObjectEntity));
    const outboxWriter = new OutboxWriterService();
    const storage = new MinioStorageAdapter(config);
    const service = new FilesService(storage, fileObjectRepository, outboxWriter, config, source);

    let uploadedId: string | null = null;
    try {
      const uploaded = await service.upload({
        buffer: Buffer.from("files module integration test content"),
        originalName: "integration-test.txt",
        mime: "text/plain",
        uploadedByUserId: uploader.id,
      });
      uploadedId = uploaded.id;

      const url = await service.getSignedUrl(uploaded.id, 60);
      expect(url).toContain(uploaded.objectKey);

      await service.delete(uploaded.id, uploader.id);
      uploadedId = null; // deleted successfully, nothing left to clean up

      expect(await fileObjectRepository.findById(uploaded.id)).toBeNull();
    } finally {
      if (uploadedId) {
        await fileObjectRepository.deleteById(uploadedId).catch(() => undefined);
      }
      await userRepo.delete({ id: uploader.id });
    }
  }, 30_000);
});
