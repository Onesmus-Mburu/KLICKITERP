import { DataSource, EntityManager } from "typeorm";
import { NotificationsService } from "../application/notifications.service";
import { Money } from "../../../shared/money/money";
import { CommMessageEntity } from "../domain/comm-message.entity";

describe("NotificationsService", () => {
  let dataSource: DataSource;
  let messageRepository: { create: jest.Mock; save: jest.Mock };
  let templatesService: { render: jest.Mock };
  let optoutsService: { isOptedOut: jest.Mock };
  let adapterResolver: { resolve: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let service: NotificationsService;

  const makeMessage = (overrides: Partial<CommMessageEntity> = {}): CommMessageEntity =>
    ({
      id: "msg-1",
      channel: "SMS",
      recipient: "+254700000000",
      status: "QUEUED",
      bodyRendered: "hi",
      queuedAt: new Date(),
      ...overrides,
    }) as CommMessageEntity;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    messageRepository = {
      create: jest.fn(async (data: Partial<CommMessageEntity>) => makeMessage(data)),
      save: jest.fn(async (entity: CommMessageEntity) => entity),
    };
    templatesService = { render: jest.fn() };
    optoutsService = { isOptedOut: jest.fn(async () => false) };
    adapterResolver = { resolve: jest.fn() };
    outboxWriter = { write: jest.fn(async () => undefined) };

    service = new NotificationsService(
      dataSource,
      messageRepository as never,
      templatesService as never,
      optoutsService as never,
      adapterResolver as never,
      outboxWriter as never,
    );
  });

  describe("opt-out gate", () => {
    it("blocks the send and records OPTED_OUT without ever resolving/calling an adapter", async () => {
      optoutsService.isOptedOut.mockResolvedValueOnce(true);

      const result = await service.send({
        channel: "SMS",
        recipient: "+254700000000",
        body: "Fees are due",
        guardianIdForOptOutCheck: "guardian-1",
      });

      expect(result.status).toBe("OPTED_OUT");
      expect(optoutsService.isOptedOut).toHaveBeenCalledWith("guardian-1", "SMS", "ALL");
      expect(adapterResolver.resolve).not.toHaveBeenCalled();
      expect(messageRepository.save).not.toHaveBeenCalled();
    });

    it("honors a custom optOutScope", async () => {
      adapterResolver.resolve.mockResolvedValueOnce({ send: jest.fn(async () => ({ providerRef: "prov-1" })) });

      await service.send({
        channel: "SMS",
        recipient: "+254700000000",
        body: "Fees are due",
        guardianIdForOptOutCheck: "guardian-1",
        optOutScope: "MARKETING",
      });

      expect(optoutsService.isOptedOut).toHaveBeenCalledWith("guardian-1", "SMS", "MARKETING");
    });
  });

  describe("successful send", () => {
    it("writes QUEUED then SENT with providerRef/cost/segments, and publishes MessageSentEvent", async () => {
      const adapter = { send: jest.fn(async () => ({ providerRef: "prov-123", cost: Money.fromDecimalString("0.80"), segments: 1 })) };
      adapterResolver.resolve.mockResolvedValueOnce(adapter);

      const result = await service.send({
        channel: "SMS",
        recipient: "+254700000000",
        body: "Fees are due",
      });

      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: "QUEUED", bodyRendered: "Fees are due" }),
      );
      expect(adapter.send).toHaveBeenCalledWith("+254700000000", "Fees are due", undefined);
      expect(result.status).toBe("SENT");
      expect(result.providerRef).toBe("prov-123");
      expect(result.segments).toBe(1);
      expect(outboxWriter.write).toHaveBeenCalledTimes(1);
    });

    it("renders via TemplatesService when eventCode is given, and passes the subject through as adapter meta", async () => {
      templatesService.render.mockResolvedValueOnce({ subject: "Reminder", body: "Rendered body" });
      const adapter = { send: jest.fn(async () => ({ providerRef: "prov-1" })) };
      adapterResolver.resolve.mockResolvedValueOnce(adapter);

      await service.send({ channel: "EMAIL", recipient: "a@example.com", eventCode: "FEE_DUE", variables: { name: "Amina" } });

      expect(templatesService.render).toHaveBeenCalledWith("FEE_DUE", "EMAIL", "en", { name: "Amina" });
      expect(adapter.send).toHaveBeenCalledWith("a@example.com", "Rendered body", { subject: "Reminder" });
    });
  });

  describe("failed send", () => {
    it("records FAILED + error without throwing to the caller", async () => {
      const adapter = { send: jest.fn(async () => { throw new Error("gateway unreachable"); }) };
      adapterResolver.resolve.mockResolvedValueOnce(adapter);

      const result = await service.send({
        channel: "SMS",
        recipient: "+254700000000",
        body: "Fees are due",
      });

      expect(result.status).toBe("FAILED");
      expect(result.error).toBe("gateway unreachable");
      expect(outboxWriter.write).not.toHaveBeenCalled();
    });
  });
});
