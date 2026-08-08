import { DataSource, EntityManager } from "typeorm";
import { BroadcastsService } from "../application/broadcasts.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { CommBroadcastEntity } from "../domain/comm-broadcast.entity";
import { CommMessageEntity } from "../domain/comm-message.entity";

describe("BroadcastsService", () => {
  let dataSource: DataSource;
  let broadcastRepository: { create: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock; list: jest.Mock };
  let notificationsService: { send: jest.Mock };
  let usersService: { listActiveUsersByRoleId: jest.Mock; listByIds: jest.Mock };
  let deviceTokensService: { listByUser: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let service: BroadcastsService;

  const makeBroadcast = (overrides: Partial<CommBroadcastEntity> = {}): CommBroadcastEntity =>
    ({
      id: "bcast-1",
      title: "Term reminder",
      channel: "EMAIL",
      body: "School closes Friday",
      audienceDef: { kind: "EXPLICIT_USER_IDS", userIds: ["u-1"] },
      status: "DRAFT",
      recipientCount: 0,
      ...overrides,
    }) as CommBroadcastEntity;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    broadcastRepository = {
      create: jest.fn(async (data: Partial<CommBroadcastEntity>) => ({ id: "bcast-new", ...data }) as CommBroadcastEntity),
      findByIdOrFail: jest.fn(),
      save: jest.fn(async (e: CommBroadcastEntity) => e),
      list: jest.fn(),
    };
    notificationsService = { send: jest.fn(async () => ({ status: "SENT" }) as CommMessageEntity) };
    usersService = { listActiveUsersByRoleId: jest.fn(async () => []), listByIds: jest.fn(async () => []) };
    deviceTokensService = { listByUser: jest.fn(async () => []) };
    outboxWriter = { write: jest.fn(async () => undefined) };

    service = new BroadcastsService(
      dataSource,
      broadcastRepository as never,
      notificationsService as never,
      usersService as never,
      deviceTokensService as never,
      outboxWriter as never,
    );
  });

  describe("create", () => {
    it("always starts a new broadcast as DRAFT with recipientCount=0", async () => {
      const created = await service.create(
        { title: "T", audienceDef: { kind: "EXPLICIT_USER_IDS", userIds: ["u-1"] }, channel: "EMAIL", body: "B" },
        "actor-1",
      );
      expect(created.status).toBe("DRAFT");
      expect(broadcastRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: "DRAFT", recipientCount: 0 }));
    });
  });

  describe("state machine", () => {
    it("allows DRAFT -> PENDING_APPROVAL via submitForApproval, storing approvalRef", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(makeBroadcast({ status: "DRAFT" }));

      const result = await service.submitForApproval("bcast-1", "approval-ref-1", "actor-1");

      expect(result.status).toBe("PENDING_APPROVAL");
      expect(result.approvalRef).toBe("approval-ref-1");
    });

    it("rejects submitForApproval without an approvalRef", async () => {
      await expect(service.submitForApproval("bcast-1", "", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("allows PENDING_APPROVAL -> APPROVED", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(makeBroadcast({ status: "PENDING_APPROVAL" }));
      const result = await service.approve("bcast-1", "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("allows APPROVED -> CANCELLED", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(makeBroadcast({ status: "APPROVED" }));
      const result = await service.cancel("bcast-1", "actor-1");
      expect(result.status).toBe("CANCELLED");
    });

    it("rejects DRAFT -> APPROVED (illegal — must go through PENDING_APPROVAL)", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(makeBroadcast({ status: "DRAFT" }));
      await expect(service.approve("bcast-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects any transition out of a terminal SENT broadcast", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(makeBroadcast({ status: "SENT" }));
      await expect(service.cancel("bcast-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects any transition out of a terminal CANCELLED broadcast", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(makeBroadcast({ status: "CANCELLED" }));
      await expect(service.approve("bcast-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("send — requires APPROVED", () => {
    it("rejects sending a non-APPROVED broadcast", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(makeBroadcast({ status: "DRAFT" }));
      await expect(service.send("bcast-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
      expect(notificationsService.send).not.toHaveBeenCalled();
    });
  });

  describe("audience resolution — EXPLICIT_USER_IDS", () => {
    it("resolves explicit user ids via UsersService.listByIds and sends to each user's email for an EMAIL broadcast", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(
        makeBroadcast({
          status: "APPROVED",
          channel: "EMAIL",
          audienceDef: { kind: "EXPLICIT_USER_IDS", userIds: ["u-1", "u-2"] },
        }),
      );
      usersService.listByIds.mockResolvedValueOnce([
        { id: "u-1", email: "a@example.com", phone: null },
        { id: "u-2", email: null, phone: "+254700000001" }, // no email -> skipped for an EMAIL broadcast
      ]);

      const result = await service.send("bcast-1", "actor-1");

      expect(usersService.listByIds).toHaveBeenCalledWith(["u-1", "u-2"]);
      expect(notificationsService.send).toHaveBeenCalledTimes(1);
      expect(notificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: "a@example.com", broadcastId: "bcast-1" }),
      );
      expect(result.recipientCount).toBe(1);
      expect(result.status).toBe("SENT");
    });
  });

  describe("audience resolution — STAFF_ROLE", () => {
    it("resolves a role's ACTIVE users via UsersService.listActiveUsersByRoleId and sends to each user's phone for an SMS broadcast", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(
        makeBroadcast({ status: "APPROVED", channel: "SMS", audienceDef: { kind: "STAFF_ROLE", roleId: "role-1" } }),
      );
      usersService.listActiveUsersByRoleId.mockResolvedValueOnce([
        { id: "u-1", email: "a@example.com", phone: "+254700000000" },
      ]);

      const result = await service.send("bcast-1", "actor-1");

      expect(usersService.listActiveUsersByRoleId).toHaveBeenCalledWith("role-1");
      expect(notificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: "+254700000000" }),
      );
      expect(result.recipientCount).toBe(1);
    });

    it("fans out one message per registered device token for a PUSH broadcast", async () => {
      broadcastRepository.findByIdOrFail.mockResolvedValue(
        makeBroadcast({ status: "APPROVED", channel: "PUSH", audienceDef: { kind: "STAFF_ROLE", roleId: "role-1" } }),
      );
      usersService.listActiveUsersByRoleId.mockResolvedValueOnce([{ id: "u-1", email: null, phone: null }]);
      deviceTokensService.listByUser.mockResolvedValueOnce([{ token: "token-a" }, { token: "token-b" }]);

      const result = await service.send("bcast-1", "actor-1");

      expect(notificationsService.send).toHaveBeenCalledTimes(2);
      expect(result.recipientCount).toBe(2);
    });
  });
});
