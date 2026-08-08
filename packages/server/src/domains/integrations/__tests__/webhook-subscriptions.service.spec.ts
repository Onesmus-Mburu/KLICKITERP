import { WebhookSubscriptionsService } from "../application/webhook-subscriptions.service";
import { IntgWebhookSubscriptionEntity } from "../domain/intg-webhook-subscription.entity";
import { ValidationException } from "../../../shared/exceptions/validation.exception";

const APP_ENCRYPTION_KEY_BASE64 = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function makeSubscription(overrides: Partial<IntgWebhookSubscriptionEntity> = {}): IntgWebhookSubscriptionEntity {
  return {
    id: "sub-1",
    url: "https://example.com/webhooks/klickit",
    secretEnc: Buffer.from("placeholder"),
    events: ["invoice.posted"],
    isActive: true,
    disabledReason: null,
    failureStreakStartedAt: null,
    ...overrides,
  } as IntgWebhookSubscriptionEntity;
}

describe("WebhookSubscriptionsService", () => {
  let subscriptionRepository: { create: jest.Mock; list: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock };
  let config: { appEncryptionKeyBase64: string };
  let service: WebhookSubscriptionsService;

  beforeEach(() => {
    subscriptionRepository = {
      create: jest.fn(async (data: Partial<IntgWebhookSubscriptionEntity>) => makeSubscription(data)),
      list: jest.fn(async () => [makeSubscription()]),
      findByIdOrFail: jest.fn(async () => makeSubscription()),
      save: jest.fn(async (e: IntgWebhookSubscriptionEntity) => e),
    };
    config = { appEncryptionKeyBase64: APP_ENCRYPTION_KEY_BASE64 };
    service = new WebhookSubscriptionsService(subscriptionRepository as never, config as never);
  });

  it("encrypts the secret on create, never storing it in plaintext", async () => {
    const created = await service.create({ url: "https://x.example/hook", secret: "top-secret-value", events: ["a"] }, "actor-1");

    expect(created.secretEnc).toBeInstanceOf(Buffer);
    expect(created.secretEnc.toString("utf8")).not.toContain("top-secret-value");
  });

  it("rejects creating a subscription with zero events", async () => {
    await expect(service.create({ url: "https://x.example/hook", secret: "12345678", events: [] }, "actor-1")).rejects.toThrow(
      ValidationException,
    );
  });

  it("round-trips the secret through getDecryptedSecret() only (never via list()/findByIdOrFail())", async () => {
    const created = await service.create({ url: "https://x.example/hook", secret: "round-trip-secret", events: ["a"] }, "actor-1");
    subscriptionRepository.findByIdOrFail.mockResolvedValue(created);

    const decrypted = await service.getDecryptedSecret(created.id);

    expect(decrypted).toBe("round-trip-secret");
  });

  it("disable() sets is_active=false and disabled_reason", async () => {
    const disabled = await service.disable("sub-1", "manual test disable", "actor-1");
    expect(disabled.isActive).toBe(false);
    expect(disabled.disabledReason).toBe("manual test disable");
  });

  it("enable() clears is_active/disabled_reason/failure_streak_started_at", async () => {
    subscriptionRepository.findByIdOrFail.mockResolvedValue(
      makeSubscription({ isActive: false, disabledReason: "was disabled", failureStreakStartedAt: new Date() }),
    );

    const enabled = await service.enable("sub-1", "actor-1");

    expect(enabled.isActive).toBe(true);
    expect(enabled.disabledReason).toBeNull();
    expect(enabled.failureStreakStartedAt).toBeNull();
  });
});
