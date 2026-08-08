import { createHmac } from "node:crypto";
import { EntityManager } from "typeorm";
import {
  WEBHOOK_AUTO_DISABLE_THRESHOLD_MS,
  WEBHOOK_BACKOFF_SCHEDULE_MINUTES,
  WEBHOOK_MAX_ATTEMPTS,
  WebhookDeliveryService,
} from "../application/webhook-delivery.service";
import { WebhookHttpError } from "../infrastructure/webhook-http-client";
import { IntgWebhookDeliveryEntity } from "../domain/intg-webhook-delivery.entity";
import { IntgWebhookSubscriptionEntity } from "../domain/intg-webhook-subscription.entity";

const EM = {} as EntityManager;
const SECRET = "whsec_test";

function makeSubscription(overrides: Partial<IntgWebhookSubscriptionEntity> = {}): IntgWebhookSubscriptionEntity {
  return {
    id: "sub-1",
    url: "https://example.com/webhooks/klickit",
    secretEnc: Buffer.from("unused"),
    events: ["invoice.posted"],
    isActive: true,
    disabledReason: null,
    failureStreakStartedAt: null,
    ...overrides,
  } as IntgWebhookSubscriptionEntity;
}

function makeDelivery(overrides: Partial<IntgWebhookDeliveryEntity> = {}): IntgWebhookDeliveryEntity {
  return {
    id: "del-1",
    subscriptionId: "sub-1",
    eventType: "invoice.posted",
    payload: { hello: "world" },
    attempt: 0,
    status: "PENDING",
    responseCode: null,
    nextRetryAt: new Date(),
    ...overrides,
  } as IntgWebhookDeliveryEntity;
}

describe("WebhookDeliveryService", () => {
  let subscriptionRepository: { findActiveForEvent: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock };
  let deliveryRepository: { create: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock; findDueForRetry: jest.Mock };
  let webhookSubscriptionsService: { getDecryptedSecret: jest.Mock; disable: jest.Mock };
  let notificationsService: { send: jest.Mock };
  let config: { integrationsAdminAlertEmail: string };
  let httpClient: { post: jest.Mock };
  let service: WebhookDeliveryService;

  let subscription: IntgWebhookSubscriptionEntity;
  let delivery: IntgWebhookDeliveryEntity;

  beforeEach(() => {
    subscription = makeSubscription();
    delivery = makeDelivery();

    subscriptionRepository = {
      findActiveForEvent: jest.fn(async () => [subscription]),
      findByIdOrFail: jest.fn(async () => subscription),
      save: jest.fn(async (e: IntgWebhookSubscriptionEntity) => {
        subscription = e;
        return e;
      }),
    };
    deliveryRepository = {
      create: jest.fn(async (data: Partial<IntgWebhookDeliveryEntity>) => makeDelivery(data)),
      findByIdOrFail: jest.fn(async () => delivery),
      save: jest.fn(async (e: IntgWebhookDeliveryEntity) => {
        delivery = e;
        return e;
      }),
      findDueForRetry: jest.fn(async () => []),
    };
    webhookSubscriptionsService = {
      getDecryptedSecret: jest.fn(async () => SECRET),
      disable: jest.fn(async (id: string, reason: string) => {
        subscription = { ...subscription, isActive: false, disabledReason: reason } as IntgWebhookSubscriptionEntity;
        return subscription;
      }),
    };
    notificationsService = { send: jest.fn(async () => undefined) };
    config = { integrationsAdminAlertEmail: "admin@klickit.local" };
    httpClient = { post: jest.fn(async () => 200) };

    service = new WebhookDeliveryService(
      subscriptionRepository as never,
      deliveryRepository as never,
      webhookSubscriptionsService as never,
      notificationsService as never,
      config as never,
      httpClient as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("dispatch", () => {
    it("creates one PENDING delivery per active subscription matching the event", async () => {
      const created = await service.dispatch(EM, "invoice.posted", { invoiceId: "inv-1" });

      expect(subscriptionRepository.findActiveForEvent).toHaveBeenCalledWith("invoice.posted", EM);
      expect(created).toHaveLength(1);
      expect(deliveryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionId: "sub-1", eventType: "invoice.posted", status: "PENDING", attempt: 0 }),
        EM,
      );
    });
  });

  describe("attemptDelivery — signature header", () => {
    it("builds the EXACT X-Klickit-Signature: t=<unix>,v1=<hex hmac> header per FR-INTG-007.1", async () => {
      jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

      await service.attemptDelivery(EM, "del-1");

      const expectedBody = JSON.stringify({ hello: "world" });
      const expectedHmac = createHmac("sha256", SECRET).update(`1700000000.${expectedBody}`).digest("hex");
      const expectedHeader = `t=1700000000,v1=${expectedHmac}`;

      expect(httpClient.post).toHaveBeenCalledWith(subscription.url, expectedBody, expectedHeader);
    });

    it("marks DELIVERED on a 2xx response and clears an open failure streak", async () => {
      subscription.failureStreakStartedAt = new Date("2026-01-01T00:00:00.000Z");
      httpClient.post.mockResolvedValue(204);

      const saved = await service.attemptDelivery(EM, "del-1");

      expect(saved.status).toBe("DELIVERED");
      expect(saved.responseCode).toBe(204);
      expect(subscription.failureStreakStartedAt).toBeNull();
    });
  });

  describe("attemptDelivery — backoff schedule progression", () => {
    it("progresses attempt/status/next_retry_at across all 8 documented backoff steps, going DEAD at attempt 8", async () => {
      expect(WEBHOOK_MAX_ATTEMPTS).toBe(8);
      expect(WEBHOOK_BACKOFF_SCHEDULE_MINUTES).toEqual([1, 5, 15, 60, 180, 360, 720, 1440]);

      for (let expectedAttempt = 1; expectedAttempt <= WEBHOOK_MAX_ATTEMPTS; expectedAttempt++) {
        const nowMs = 1_700_000_000_000 + expectedAttempt; // strictly increasing, distinct per iteration
        jest.spyOn(Date, "now").mockReturnValue(nowMs);
        httpClient.post.mockRejectedValueOnce(new WebhookHttpError("Webhook target responded 500: boom", 500));

        const saved = await service.attemptDelivery(EM, "del-1");

        expect(saved.attempt).toBe(expectedAttempt);
        expect(saved.responseCode).toBe(500);

        const expectedDelayMs = WEBHOOK_BACKOFF_SCHEDULE_MINUTES[expectedAttempt - 1] * 60_000;
        expect(saved.nextRetryAt.getTime()).toBe(nowMs + expectedDelayMs);

        if (expectedAttempt < WEBHOOK_MAX_ATTEMPTS) {
          expect(saved.status).toBe("FAILED");
        } else {
          expect(saved.status).toBe("DEAD");
        }
      }
    });

    it("records a null response_code for a network-level failure (no HTTP status available)", async () => {
      httpClient.post.mockRejectedValueOnce(new WebhookHttpError("ECONNREFUSED", null));

      const saved = await service.attemptDelivery(EM, "del-1");

      expect(saved.attempt).toBe(1);
      expect(saved.responseCode).toBeNull();
      expect(saved.status).toBe("FAILED");
    });
  });

  describe("attemptDelivery — 72h auto-disable (FR-INTG-007.1)", () => {
    it("starts the failure streak on the first failure without disabling", async () => {
      httpClient.post.mockRejectedValueOnce(new WebhookHttpError("boom", 500));

      await service.attemptDelivery(EM, "del-1");

      expect(subscription.failureStreakStartedAt).not.toBeNull();
      expect(webhookSubscriptionsService.disable).not.toHaveBeenCalled();
      expect(notificationsService.send).not.toHaveBeenCalled();
    });

    it("does NOT disable while the streak has been open for under 72h", async () => {
      const streakStart = new Date("2026-01-01T00:00:00.000Z");
      subscription.failureStreakStartedAt = streakStart;
      jest.spyOn(Date, "now").mockReturnValue(streakStart.getTime() + WEBHOOK_AUTO_DISABLE_THRESHOLD_MS - 60_000);
      httpClient.post.mockRejectedValueOnce(new WebhookHttpError("boom", 500));

      await service.attemptDelivery(EM, "del-1");

      expect(webhookSubscriptionsService.disable).not.toHaveBeenCalled();
    });

    it("auto-disables and sends a best-effort admin alert once the streak has been open for >= 72h", async () => {
      const streakStart = new Date("2026-01-01T00:00:00.000Z");
      subscription.failureStreakStartedAt = streakStart;
      jest.spyOn(Date, "now").mockReturnValue(streakStart.getTime() + WEBHOOK_AUTO_DISABLE_THRESHOLD_MS + 1_000);
      httpClient.post.mockRejectedValueOnce(new WebhookHttpError("boom", 500));

      await service.attemptDelivery(EM, "del-1");

      expect(webhookSubscriptionsService.disable).toHaveBeenCalledWith(
        "sub-1",
        expect.stringContaining("72h"),
        null,
        EM,
      );
      expect(notificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "EMAIL", recipient: "admin@klickit.local", entityId: "sub-1" }),
      );
    });

    it("swallows a failed admin-alert send without throwing (best-effort)", async () => {
      const streakStart = new Date("2026-01-01T00:00:00.000Z");
      subscription.failureStreakStartedAt = streakStart;
      jest.spyOn(Date, "now").mockReturnValue(streakStart.getTime() + WEBHOOK_AUTO_DISABLE_THRESHOLD_MS + 1_000);
      httpClient.post.mockRejectedValueOnce(new WebhookHttpError("boom", 500));
      notificationsService.send.mockRejectedValueOnce(new Error("smtp down"));

      await expect(service.attemptDelivery(EM, "del-1")).resolves.toBeDefined();
      expect(webhookSubscriptionsService.disable).toHaveBeenCalled();
    });
  });

  describe("processDue", () => {
    it("is partial-failure-tolerant across a batch", async () => {
      const dueA = makeDelivery({ id: "due-a" });
      const dueB = makeDelivery({ id: "due-b" });
      deliveryRepository.findDueForRetry.mockResolvedValue([dueA, dueB]);
      deliveryRepository.findByIdOrFail.mockImplementation(async (id: string) => (id === "due-a" ? dueA : dueB));
      subscriptionRepository.findByIdOrFail.mockImplementationOnce(async () => {
        throw new Error("boom on first lookup");
      });

      const result = await service.processDue(EM);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});
