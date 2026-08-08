import { ApiProperty } from "@nestjs/swagger";
import { CommDevicePlatform } from "../../domain/comm-device-token.entity";

export class DeviceTokenResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({ maxLength: 300 })
  token!: string;

  @ApiProperty()
  platform!: CommDevicePlatform;

  @ApiProperty()
  lastSeenAt!: Date;

  @ApiProperty()
  createdAt!: Date;
}
