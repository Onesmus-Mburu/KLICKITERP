import { EntityManager } from "typeorm";
import { DocumentVerificationService } from "../application/document-verification.service";
import { DocvRecordEntity } from "../domain/docv-record.entity";

const EM = {} as EntityManager;

describe("DocumentVerificationService", () => {
  let repository: {
    create: jest.Mock;
    findByToken: jest.Mock;
    findByDocument: jest.Mock;
  };
  let service: DocumentVerificationService;

  beforeEach(() => {
    repository = {
      create: jest.fn(
        async (data: Partial<DocvRecordEntity>) =>
          ({ id: "docv-1", createdAt: new Date("2026-08-07T00:00:00Z"), ...data }) as unknown as DocvRecordEntity,
      ),
      findByToken: jest.fn(),
      findByDocument: jest.fn(),
    };
    service = new DocumentVerificationService(repository as never);
  });

  describe("mint", () => {
    it("generates an opaque base64url token and persists a docv_record row via the caller's EntityManager", async () => {
      const result = await service.mint(EM, {
        documentType: "PAYMENT_RECEIPT",
        documentId: "receipt-1",
        documentRef: "PAY-000001",
        summary: { total: "1000.0000" },
      });

      // 18 bytes base64url-encoded is always 24 chars, no padding.
      expect(result.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(repository.create).toHaveBeenCalledWith(
        {
          documentType: "PAYMENT_RECEIPT",
          documentId: "receipt-1",
          documentRef: "PAY-000001",
          summary: { total: "1000.0000" },
          token: result.token,
        },
        EM,
      );
    });

    it("mints a different token on every call (no reuse/collision by construction)", async () => {
      const first = await service.mint(EM, { documentType: "X", documentId: "a", documentRef: "a", summary: {} });
      const second = await service.mint(EM, { documentType: "X", documentId: "b", documentRef: "b", summary: {} });
      expect(first.token).not.toBe(second.token);
    });
  });

  describe("findByDocument", () => {
    it("returns the token for a matching (documentType, documentId)", async () => {
      repository.findByDocument.mockResolvedValue({ token: "tok-abc" } as unknown as DocvRecordEntity);

      const result = await service.findByDocument("PAYMENT_RECEIPT", "receipt-1");

      expect(repository.findByDocument).toHaveBeenCalledWith("PAYMENT_RECEIPT", "receipt-1");
      expect(result).toEqual({ token: "tok-abc" });
    });

    it("returns null when no record exists for the document yet (predates this feature, or a DRAFT never-published document)", async () => {
      repository.findByDocument.mockResolvedValue(null);

      const result = await service.findByDocument("FEE_STRUCTURE", "structure-unpublished");

      expect(result).toBeNull();
    });
  });

  describe("verify", () => {
    it("resolves a real token to its documentType/documentRef/summary/issuedAt", async () => {
      const issuedAt = new Date("2026-08-07T00:00:00Z");
      repository.findByToken.mockResolvedValue({
        documentType: "FEE_STRUCTURE",
        documentRef: "Grade 4 v2",
        summary: { version: 2 },
        createdAt: issuedAt,
      } as unknown as DocvRecordEntity);

      const result = await service.verify("tok-real");

      expect(repository.findByToken).toHaveBeenCalledWith("tok-real");
      expect(result).toEqual({
        documentType: "FEE_STRUCTURE",
        documentRef: "Grade 4 v2",
        summary: { version: 2 },
        issuedAt,
      });
    });

    it("returns null for an unknown/garbage token — the controller turns this into a real 404", async () => {
      repository.findByToken.mockResolvedValue(null);

      const result = await service.verify("garbage-token");

      expect(result).toBeNull();
    });
  });
});
