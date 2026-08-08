import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type SetIntegrationKind =
  | "SMTP"
  | "SMS"
  | "FCM"
  | "MPESA"
  | "QUICKBOOKS"
  | "XERO"
  | "SAGE"
  | "BANK"
  | "WHATSAPP";

/**
 * Maps to `set_integration_config` (docs/phase-4/02-schema-platform-accounting.md
 * §4). `configEnc` holds the provider credentials AES-256-GCM-encrypted
 * (FR-SET-003.1) — encryption/decryption happens in
 * `IntegrationConfigService`, never here. Backs the ports described in
 * docs/phase-3/02-communication-authentication.md §1.5 (`SmsPort`,
 * `MailPort`, `PushPort`, `MpesaPort`, `BankStatementPort`,
 * `AccountingSyncPort`) — this module only stores/tests-the-shape-of
 * credentials; the real adapters arrive with their owning modules.
 */
@Entity("set_integration_config")
@Index("uq_set_integration_config_kind_name", ["kind", "name"], { unique: true })
@Check(
  "ck_set_integration_config_kind",
  `"kind" IN ('SMTP','SMS','FCM','MPESA','QUICKBOOKS','XERO','SAGE','BANK','WHATSAPP')`,
)
export class SetIntegrationConfigEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "kind" })
  kind!: SetIntegrationKind;

  @Column({ type: "varchar", length: 60, name: "name" })
  name!: string;

  @Column({ type: "bytea", name: "config_enc" })
  configEnc!: Buffer;

  @Column({ type: "boolean", name: "is_enabled", default: true })
  isEnabled!: boolean;

  @Column({ type: "int", name: "priority", default: 0 })
  priority!: number;

  @Column({ type: "timestamptz", name: "last_tested_at", nullable: true })
  lastTestedAt!: Date | null;

  @Column({ type: "boolean", name: "last_test_ok", nullable: true })
  lastTestOk!: boolean | null;
}
