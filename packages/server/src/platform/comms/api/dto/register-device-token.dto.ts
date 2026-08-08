import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, MaxLength } from "class-validator";
import { CommDevicePlatform } from "../../domain/comm-device-token.entity";

const PLATFORMS: CommDevicePlatform[] = ["IOS", "ANDROID", "WEB"];

export class RegisterDeviceTokenDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  token!: string;

  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  platform!: CommDevicePlatform;
}
