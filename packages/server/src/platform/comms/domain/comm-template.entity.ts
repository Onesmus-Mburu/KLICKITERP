import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type CommChannel = "SMS" | "EMAIL" | "PUSH" | "WHATSAPP" | "INAPP";

export const COMM_CHANNELS: readonly CommChannel[] = ["SMS", "EMAIL", "PUSH", "WHATSAPP", "INAPP"];

/**
 * Maps to `comm_template` (docs/phase-4/02-schema-platform-accounting.md §5).
 * `variables` is opaque jsonb describing the placeholder names a template's
 * `body`/`subject` accept (documentation only — `TemplatesService.render()`
 * does a simple `{{name}}` substitution and does not validate `variables`
 * against the supplied substitution map).
 *
 * `uq(event_code, channel, locale)` backs `TemplatesService.render()`'s
 * locale-fallback lookup (requested locale, then `'en'`).
 */
@Entity("comm_template")
@Index("uq_comm_template_event_channel_locale", ["eventCode", "channel", "locale"], { unique: true })
@Check("ck_comm_template_channel", `"channel" IN ('SMS','EMAIL','PUSH','WHATSAPP','INAPP')`)
export class CommTemplateEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 50, name: "event_code" })
  eventCode!: string;

  @Column({ type: "varchar", length: 10, name: "channel" })
  channel!: CommChannel;

  @Column({ type: "varchar", length: 8, name: "locale", default: "en" })
  locale!: string;

  @Column({ type: "varchar", length: 200, name: "subject", nullable: true })
  subject!: string | null;

  @Column({ type: "text", name: "body" })
  body!: string;

  @Column({ type: "jsonb", name: "variables" })
  variables!: unknown;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}
