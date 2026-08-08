import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { decryptFromBuffer, encryptToBuffer } from "../../../shared/crypto/aes-gcm.util";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { SetIntegrationConfigEntity, SetIntegrationKind } from "../domain/set-integration-config.entity";
import { SetIntegrationConfigRepository } from "../infrastructure/set-integration-config.repository";
import { fetchDarajaOAuthToken } from "../infrastructure/mpesa-oauth-probe";

export interface CreateIntegrationConfigInput {
  kind: SetIntegrationKind;
  name: string;
  config: Record<string, unknown>;
  isEnabled?: boolean;
  priority?: number;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * Ports & adapters registry backing docs/phase-3/02-communication-authentication.md
 * §1.5 (`SmsPort`, `MailPort`, `PushPort`, `MpesaPort`, `BankStatementPort`,
 * `AccountingSyncPort`). This module only stores/tests-the-shape-of
 * credentials — `config` (the provider-specific credential payload) is
 * AES-256-GCM-encrypted into `config_enc` (FR-SET-003.1) here, never in the
 * entity/repository. The real adapters (Africa's Talking, SMTP, Daraja,
 * QuickBooks, ...) arrive with their owning modules; until then
 * `testConnection` is an intentional stub for every kind EXCEPT `MPESA`
 * (Phase 6 Slice 7 — see `testMpesaConnection()`'s own doc comment for the
 * real Daraja OAuth probe this adds, and why it can't cleanly reuse
 * `domains/payments`' own `DarajaAdapter`).
 */
@Injectable()
export class IntegrationConfigService {
  constructor(
    private readonly integrationConfigRepository: SetIntegrationConfigRepository,
    private readonly config: AppConfigService,
  ) {}

  async create(input: CreateIntegrationConfigInput, actorId: string | null): Promise<SetIntegrationConfigEntity> {
    if (await this.integrationConfigRepository.findByKindAndName(input.kind, input.name)) {
      throw new ConflictException(`Integration config already exists: ${input.kind}/${input.name}`);
    }
    return this.integrationConfigRepository.create({
      kind: input.kind,
      name: input.name,
      configEnc: this.encode(input.config),
      isEnabled: input.isEnabled ?? true,
      priority: input.priority ?? 0,
      lastTestedAt: null,
      lastTestOk: null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(): Promise<SetIntegrationConfigEntity[]> {
    return this.integrationConfigRepository.list();
  }

  async findByIdOrFail(id: string): Promise<SetIntegrationConfigEntity> {
    const row = await this.integrationConfigRepository.findById(id);
    if (!row) throw new NotFoundException("IntegrationConfig", id);
    return row;
  }

  /** Decrypts `config_enc` back into the plain credential payload — for the owning adapter's future use, not exposed over HTTP. */
  async getDecryptedConfig(id: string): Promise<Record<string, unknown>> {
    const row = await this.findByIdOrFail(id);
    return this.decode(row.configEnc);
  }

  async update(
    id: string,
    changes: { name?: string; config?: Record<string, unknown>; isEnabled?: boolean; priority?: number },
    actorId: string | null,
  ): Promise<SetIntegrationConfigEntity> {
    const row = await this.findByIdOrFail(id);
    if (changes.name !== undefined) row.name = changes.name;
    if (changes.config !== undefined) row.configEnc = this.encode(changes.config);
    if (changes.isEnabled !== undefined) row.isEnabled = changes.isEnabled;
    if (changes.priority !== undefined) row.priority = changes.priority;
    row.updatedBy = actorId;
    return this.integrationConfigRepository.save(row);
  }

  /**
   * FR-SET-003.1 "Test Connection button exercising a real harmless call".
   * `MPESA` (Phase 6 Slice 7) is the FIRST real, non-stub branch — every
   * other `kind` still returns the same stub result (comms/banking/
   * integrations modules' own adapters aren't wired into this generic
   * registry yet, and fixing every other kind is explicitly out of this
   * pass's scope) — this is intentional, not a placeholder bug for those.
   * `last_tested_at`/`last_test_ok` are still updated for every kind so the
   * UI's "last tested" badge behaves correctly once more real adapters land.
   */
  async testConnection(id: string, actorId: string | null): Promise<TestConnectionResult> {
    const row = await this.findByIdOrFail(id);
    const result = row.kind === "MPESA" ? await this.testMpesaConnection(row) : this.stubTestFor(row.kind);

    row.lastTestedAt = new Date();
    row.lastTestOk = result.ok;
    row.updatedBy = actorId;
    await this.integrationConfigRepository.save(row);

    return result;
  }

  /**
   * A REAL attempt — decrypts this row's own config, then makes a genuine
   * Daraja OAuth token-fetch call (`fetchDarajaOAuthToken()`, see that
   * function's own doc comment for why it duplicates rather than reuses
   * `DarajaAdapter`). In this dev environment (no outbound network,
   * docs/phase-5/PROGRESS.md "Environment status") a real MPESA config's
   * test is expected to genuinely FAIL with a real connectivity/DNS/auth
   * error — that is the correct, honest result this method reports, not the
   * old hardcoded "adapter not yet available" stub message. Every failure
   * path (missing/malformed config, decryption failure, network error, a
   * non-2xx Daraja response) is caught here and turned into a clean
   * `{ok:false, message}` — this method never throws.
   */
  private async testMpesaConnection(row: SetIntegrationConfigEntity): Promise<TestConnectionResult> {
    try {
      const config = this.decode(row.configEnc);
      const consumerKey = typeof config.consumerKey === "string" ? config.consumerKey : "";
      const consumerSecret = typeof config.consumerSecret === "string" ? config.consumerSecret : "";
      if (!consumerKey || !consumerSecret) {
        return { ok: false, message: "MPESA config is missing a real consumerKey/consumerSecret — cannot attempt a Daraja OAuth token fetch" };
      }
      const environment = config.environment === "production" ? "production" : "sandbox";
      const timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : undefined;
      await fetchDarajaOAuthToken({ environment, consumerKey, consumerSecret, timeoutMs });
      return { ok: true, message: `Daraja OAuth token fetch succeeded (${environment})` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `Daraja OAuth token fetch failed: ${message}` };
    }
  }

  private stubTestFor(kind: SetIntegrationKind): TestConnectionResult {
    const STUB_MESSAGE = "adapter not yet available, config saved";
    switch (kind) {
      case "SMTP":
      case "SMS":
      case "FCM":
      case "QUICKBOOKS":
      case "XERO":
      case "SAGE":
      case "BANK":
      case "WHATSAPP":
        return { ok: false, message: STUB_MESSAGE };
      case "MPESA":
        /* istanbul ignore next -- unreachable: testConnection() routes MPESA to testMpesaConnection() before this is ever called */
        return { ok: false, message: STUB_MESSAGE };
      /* istanbul ignore next -- exhaustive over SetIntegrationKind, unreachable at the type level */
      default: {
        const exhaustive: never = kind;
        return { ok: false, message: `${STUB_MESSAGE} (unknown kind: ${String(exhaustive)})` };
      }
    }
  }

  private encode(config: Record<string, unknown>): Buffer {
    return encryptToBuffer(JSON.stringify(config), this.config.appEncryptionKeyBase64);
  }

  private decode(configEnc: Buffer): Record<string, unknown> {
    return JSON.parse(decryptFromBuffer(configEnc, this.config.appEncryptionKeyBase64)) as Record<string, unknown>;
  }
}
