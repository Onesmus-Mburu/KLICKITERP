import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { CommChannel } from "./comm-template.entity";

/**
 * Maps to `comm_trigger_binding` (docs/phase-4/02-schema-platform-accounting.md
 * §5) — which business event codes, on which channel, are currently wired to
 * actually send (`is_enabled`), and an optional `audience_rule` jsonb
 * narrowing who receives it beyond the event's natural recipient (opaque
 * here, interpreted by whichever future module raises the event — this
 * module only stores/serves the binding, it does not itself dispatch on
 * domain events yet, since no event-driven trigger dispatcher exists in this
 * codebase; see `TriggerBindingsService`'s doc comment).
 */
@Entity("comm_trigger_binding")
@Index("uq_comm_trigger_binding_event_channel", ["eventCode", "channel"], { unique: true })
@Check("ck_comm_trigger_binding_channel", `"channel" IN ('SMS','EMAIL','PUSH','WHATSAPP','INAPP')`)
export class CommTriggerBindingEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 50, name: "event_code" })
  eventCode!: string;

  @Column({ type: "varchar", length: 10, name: "channel" })
  channel!: CommChannel;

  @Column({ type: "boolean", name: "is_enabled", default: true })
  isEnabled!: boolean;

  @Column({ type: "jsonb", name: "audience_rule", nullable: true })
  audienceRule!: unknown;
}
