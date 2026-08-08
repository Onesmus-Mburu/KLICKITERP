import { App, cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { generateUuidV7 } from "../../../../shared/ids/uuid7";
import { PushPort } from "../ports/push.port";
import { SendResult } from "../ports/send-result";

/** Sourced from a `set_integration_config` row of `kind='FCM'` (decrypted by `AdapterResolverService`), never raw env vars. */
export interface FcmPushConfig {
  projectId: string;
  clientEmail: string;
  /** PEM private key from the Firebase service account JSON — `\n` escape sequences are un-escaped before use (a common artifact of storing PEM text inside JSON). */
  privateKey: string;
}

/**
 * Real `firebase-admin`-based `PushPort` implementation. Each instance owns
 * its own named Firebase `App` (the Admin SDK keys apps by name in a
 * process-global registry, so a fixed/default name would collide the moment
 * a second instance were constructed — `AdapterResolverService` already
 * caches one adapter instance per resolved integration config, so in
 * practice this constructor only runs once per config until it changes).
 */
export class FcmPushAdapter implements PushPort {
  private readonly app: App;

  constructor(config: FcmPushConfig) {
    this.app = initializeApp(
      {
        credential: cert({
          projectId: config.projectId,
          clientEmail: config.clientEmail,
          privateKey: config.privateKey.replace(/\\n/g, "\n"),
        }),
      },
      `comms-fcm-${generateUuidV7()}`,
    );
  }

  async send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult> {
    const title = typeof meta?.title === "string" ? meta.title : "Notification";
    const messageId = await getMessaging(this.app).send({
      token: recipient,
      notification: { title, body },
    });
    return { providerRef: messageId };
  }

  /** Releases the underlying Firebase `App` — call when an adapter instance is evicted (e.g. `AdapterResolverService` re-resolving after a config change) to avoid leaking named apps in the process-global registry. */
  async dispose(): Promise<void> {
    await deleteApp(this.app);
  }
}
