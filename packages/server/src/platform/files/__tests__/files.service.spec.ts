import { DataSource, EntityManager } from "typeorm";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FilesService } from "../application/files.service";
import { FileObjectEntity } from "../domain/file-object.entity";

describe("FilesService", () => {
  let dataSource: DataSource;
  let storage: {
    putObject: jest.Mock;
    getSignedUrl: jest.Mock;
    deleteObject: jest.Mock;
  };
  let fileObjectRepository: {
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    listByEntity: jest.Mock;
    create: jest.Mock;
    deleteById: jest.Mock;
  };
  let outboxWriter: { write: jest.Mock };
  let service: FilesService;

  const ORIGINAL_NAME = "report card.pdf";
  const MIME = "application/pdf";

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    storage = {
      putObject: jest.fn(async (_bucket: string, _key: string, body: Buffer) => ({
        sha256: "deadbeef".repeat(8),
        sizeBytes: body.byteLength,
      })),
      getSignedUrl: jest.fn(async () => "https://minio.example/signed"),
      deleteObject: jest.fn(async () => undefined),
    };

    fileObjectRepository = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      listByEntity: jest.fn(),
      create: jest.fn(async (data: Partial<FileObjectEntity>) => ({ id: "file-1", ...data }) as FileObjectEntity),
      deleteById: jest.fn(async () => undefined),
    };

    outboxWriter = { write: jest.fn(async () => undefined) };

    service = new FilesService(
      storage as never,
      fileObjectRepository as never,
      outboxWriter as never,
      new AppConfigService(),
      dataSource,
    );
  });

  describe("upload", () => {
    it("computes sha256/size via the storage port and persists matching file_object metadata", async () => {
      const buffer = Buffer.from("hello world");

      const result = await service.upload({
        buffer,
        originalName: ORIGINAL_NAME,
        mime: MIME,
        uploadedByUserId: "user-1",
        entityType: "STUDENT",
        entityId: "student-1",
      });

      expect(storage.putObject).toHaveBeenCalledWith(
        "klickit-files",
        expect.stringMatching(/^[0-9a-f-]{36}\/report_card\.pdf$/),
        buffer,
        MIME,
      );
      expect(fileObjectRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "klickit-files",
          originalName: ORIGINAL_NAME,
          mime: MIME,
          sizeBytes: String(buffer.byteLength),
          sha256: "deadbeef".repeat(8),
          entityType: "STUDENT",
          entityId: "student-1",
          uploadedBy: "user-1",
          createdBy: "user-1",
        }),
        expect.anything(),
      );
      expect(outboxWriter.write).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("file-1");
    });

    it("rejects an oversized upload before ever touching storage", async () => {
      const config = new AppConfigService();
      const oversized = Buffer.alloc(config.fileMaxUploadBytes + 1);

      await expect(
        service.upload({
          buffer: oversized,
          originalName: "big.pdf",
          mime: MIME,
          uploadedByUserId: "user-1",
        }),
      ).rejects.toBeInstanceOf(ValidationException);

      expect(storage.putObject).not.toHaveBeenCalled();
      expect(fileObjectRepository.create).not.toHaveBeenCalled();
    });

    it("rejects a disallowed MIME type before ever touching storage", async () => {
      await expect(
        service.upload({
          buffer: Buffer.from("x"),
          originalName: "script.sh",
          mime: "application/x-sh",
          uploadedByUserId: "user-1",
        }),
      ).rejects.toBeInstanceOf(ValidationException);

      expect(storage.putObject).not.toHaveBeenCalled();
      expect(fileObjectRepository.create).not.toHaveBeenCalled();
    });

    it("compensates with a best-effort storage delete when the DB insert fails after a successful storage write", async () => {
      const dbError = new Error("connection reset");
      fileObjectRepository.create.mockRejectedValueOnce(dbError);

      await expect(
        service.upload({
          buffer: Buffer.from("hello"),
          originalName: "note.pdf",
          mime: MIME,
          uploadedByUserId: "user-1",
        }),
      ).rejects.toBe(dbError);

      expect(storage.putObject).toHaveBeenCalledTimes(1);
      const [bucket, key] = storage.putObject.mock.calls[0] as [string, string];
      expect(storage.deleteObject).toHaveBeenCalledWith(bucket, key);
    });

    it("still rethrows the original DB error when the compensating delete itself fails", async () => {
      const dbError = new Error("connection reset");
      fileObjectRepository.create.mockRejectedValueOnce(dbError);
      storage.deleteObject.mockRejectedValueOnce(new Error("minio unreachable"));

      await expect(
        service.upload({
          buffer: Buffer.from("hello"),
          originalName: "note.pdf",
          mime: MIME,
          uploadedByUserId: "user-1",
        }),
      ).rejects.toBe(dbError);
    });
  });

  describe("getSignedUrl", () => {
    it("delegates to the storage port with the file's bucket/key and given expiry", async () => {
      fileObjectRepository.findByIdOrFail.mockResolvedValue({
        id: "file-1",
        bucket: "klickit-files",
        objectKey: "abc/report.pdf",
      } as FileObjectEntity);

      const url = await service.getSignedUrl("file-1", 900);

      expect(storage.getSignedUrl).toHaveBeenCalledWith("klickit-files", "abc/report.pdf", 900);
      expect(url).toBe("https://minio.example/signed");
    });

    it("defaults to a 300s expiry when none is given", async () => {
      fileObjectRepository.findByIdOrFail.mockResolvedValue({
        id: "file-1",
        bucket: "klickit-files",
        objectKey: "abc/report.pdf",
      } as FileObjectEntity);

      await service.getSignedUrl("file-1");

      expect(storage.getSignedUrl).toHaveBeenCalledWith("klickit-files", "abc/report.pdf", 300);
    });

    it("propagates NotFoundException for an unknown file id", async () => {
      fileObjectRepository.findByIdOrFail.mockRejectedValue(new NotFoundException("FileObject", "missing"));
      await expect(service.getSignedUrl("missing")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("delete", () => {
    it("removes the storage object then the file_object row, in that order", async () => {
      const callOrder: string[] = [];
      fileObjectRepository.findByIdOrFail.mockResolvedValue({
        id: "file-1",
        bucket: "klickit-files",
        objectKey: "abc/report.pdf",
        entityType: "STUDENT",
        entityId: "student-1",
      } as FileObjectEntity);
      storage.deleteObject.mockImplementation(async () => {
        callOrder.push("storage.deleteObject");
      });
      fileObjectRepository.deleteById.mockImplementation(async () => {
        callOrder.push("repository.deleteById");
      });

      await service.delete("file-1", "actor-1");

      expect(callOrder).toEqual(["storage.deleteObject", "repository.deleteById"]);
      expect(storage.deleteObject).toHaveBeenCalledWith("klickit-files", "abc/report.pdf");
      expect(fileObjectRepository.deleteById).toHaveBeenCalledWith("file-1", expect.anything());
      expect(outboxWriter.write).toHaveBeenCalledTimes(1);
    });
  });

  describe("listByEntity", () => {
    it("delegates straight to the repository", async () => {
      const rows = [{ id: "file-1" } as FileObjectEntity];
      fileObjectRepository.listByEntity.mockResolvedValue(rows);

      const result = await service.listByEntity("STUDENT", "student-1");

      expect(fileObjectRepository.listByEntity).toHaveBeenCalledWith("STUDENT", "student-1");
      expect(result).toBe(rows);
    });
  });
});
