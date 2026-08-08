import { Injectable } from "@nestjs/common";
import { IntegrationConfigService } from "../../../platform/settings";
import { DarajaAdapter, DarajaConfig } from "./adapters/daraja.adapter";
import { MpesaLogOnlyAdapter } from "./adapters/mpesa-log-only.adapter";
import { MpesaPort } from "./ports/mpesa.port";

interface CacheEntry {
  configId: string;
  adapter: MpesaPort;
}

/**
 * Resolves the active `MpesaPort` implementation — the exact pattern
 * `platform/comms`' `AdapterResolverService` established, narrowed to a
 * single channel (`kind='MPESA'`). Asks `platform/settings`'
 * `IntegrationConfigService` (public service only, never its repositories —
 * `module-deps.json`'s `domains/payments` entry) for the highest-priority
 * enabled `MPESA` config and constructs a real `DarajaAdapter` from its
 * decrypted credentials; falls back to `MpesaLogOnlyAdapter` when none is
 * enabled. Adapter instance cached by resolved config id, re-resolved the
 * moment the enabled config changes — same caching shape as comms'
 * `resolveSms()`/`resolveMail()`.
 */
@Injectable()
export class MpesaAdapterResolverService {
  private cache: CacheEntry | null = null;

  constructor(
    private readonly integrationConfigService: IntegrationConfigService,
    private readonly logOnlyAdapter: MpesaLogOnlyAdapter,
  ) {}

  async resolve(): Promise<MpesaPort> {
    const configs = await this.integrationConfigService.list();
    const enabled = configs.filter((c) => c.kind === "MPESA" && c.isEnabled).sort((a, b) => b.priority - a.priority)[0];
    if (!enabled) return this.logOnlyAdapter;
    if (this.cache?.configId === enabled.id) return this.cache.adapter;

    const config = (await this.integrationConfigService.getDecryptedConfig(enabled.id)) as unknown as DarajaConfig;
    const adapter = new DarajaAdapter(config);
    this.cache = { configId: enabled.id, adapter };
    return adapter;
  }
}
