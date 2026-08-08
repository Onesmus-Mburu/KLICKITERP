import { ApiProperty } from "@nestjs/swagger";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";

const MESSAGE_STATUSES = ["QUEUED", "SENT", "DELIVERED", "FAILED", "OPTED_OUT"] as const;

export class MessageResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: COMM_CHANNELS })
  channel!: CommChannel;

  @ApiProperty({ maxLength: 160 })
  recipient!: string;

  @ApiProperty({ nullable: true, type: String })
  templateEvent!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  broadcastId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  entityType!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  entityId!: string | null;

  @ApiProperty()
  bodyRendered!: string;

  @ApiProperty({ enum: MESSAGE_STATUSES })
  status!: (typeof MESSAGE_STATUSES)[number];

  @ApiProperty({ nullable: true, type: String })
  provider!: string | null;

  @ApiProperty({ nullable: true, type: String })
  providerRef!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Decimal string" })
  costAmount!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  segments!: number | null;

  @ApiProperty({ nullable: true, type: String })
  error!: string | null;

  @ApiProperty()
  queuedAt!: Date;

  @ApiProperty({ nullable: true, type: Date })
  sentAt!: Date | null;

  @ApiProperty({ nullable: true, type: Date })
  deliveredAt!: Date | null;
}
