import { ApiProperty } from "@nestjs/swagger";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";

export class OptoutResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  guardianId!: string;

  @ApiProperty({ enum: COMM_CHANNELS })
  channel!: CommChannel;

  @ApiProperty({ maxLength: 30 })
  scope!: string;

  @ApiProperty()
  createdAt!: Date;
}
