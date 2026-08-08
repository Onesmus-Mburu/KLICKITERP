import { ApiProperty } from "@nestjs/swagger";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";

export class TriggerBindingResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 50 })
  eventCode!: string;

  @ApiProperty({ enum: COMM_CHANNELS })
  channel!: CommChannel;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiProperty({ type: Object, nullable: true })
  audienceRule!: unknown;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty()
  version!: number;
}
