import { ApiProperty } from "@nestjs/swagger";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";

export class TemplateResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 50 })
  eventCode!: string;

  @ApiProperty({ enum: COMM_CHANNELS })
  channel!: CommChannel;

  @ApiProperty({ maxLength: 8 })
  locale!: string;

  @ApiProperty({ nullable: true, type: String })
  subject!: string | null;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: Object })
  variables!: unknown;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty()
  version!: number;
}
