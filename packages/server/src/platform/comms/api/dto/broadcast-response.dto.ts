import { ApiProperty } from "@nestjs/swagger";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";

const BROADCAST_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENDING", "SENT", "CANCELLED"] as const;

export class BroadcastResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 120 })
  title!: string;

  @ApiProperty({ type: Object })
  audienceDef!: unknown;

  @ApiProperty({ enum: COMM_CHANNELS })
  channel!: CommChannel;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  recipientCount!: number;

  @ApiProperty({ type: String, description: "Decimal string" })
  estCostAmount!: string;

  @ApiProperty({ enum: BROADCAST_STATUSES })
  status!: (typeof BROADCAST_STATUSES)[number];

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  approvalRef!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty()
  version!: number;
}
